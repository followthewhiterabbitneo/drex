// EKG Heartbeat Monitor - Shows query spikes like a medical monitor
const mysql = require('mysql2/promise');
const http = require('http');

const config = {
  DB_HOST: 's01vpsoxweb010',
  DB_PORT: 3306,
  DB_NAME: 'oreka',
  DB_USER: 'DEA',
  DB_PASS: 'hotchip',
  API_PORT: 3001,
  WEB_PORT: 3000
};

// Store history for EKG display
const HISTORY_SIZE = 300; // 5 minutes at 1 sample/sec
const queryHistory = new Array(HISTORY_SIZE).fill(0);
const lockHistory = new Array(HISTORY_SIZE).fill(0);
const connectionHistory = new Array(HISTORY_SIZE).fill(0);
let historyIndex = 0;
let lastQuestions = 0;
let lastTime = Date.now();

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Sample metrics every second
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    const [[status]] = await connection.execute("SHOW STATUS LIKE 'Questions'");
    const [[threads]] = await connection.execute("SHOW STATUS LIKE 'Threads_connected'");
    const [processList] = await connection.execute('SHOW PROCESSLIST');
    
    const currentQuestions = parseInt(status.Value);
    const currentTime = Date.now();
    
    // Calculate QPS
    const qps = lastQuestions > 0 ? 
      Math.round((currentQuestions - lastQuestions) / ((currentTime - lastTime) / 1000)) : 0;
    
    // Count locks
    const locks = processList.filter(p => 
      p.State && (p.State.includes('lock') || p.State.includes('Lock'))
    ).length;
    
    // Update history
    queryHistory[historyIndex] = Math.min(qps, 5000); // Cap at 5000 for display
    lockHistory[historyIndex] = locks;
    connectionHistory[historyIndex] = parseInt(threads.Value);
    
    historyIndex = (historyIndex + 1) % HISTORY_SIZE;
    lastQuestions = currentQuestions;
    lastTime = currentTime;
    
    connection.release();
  } catch (err) {
    console.error('Sampling error:', err);
  }
}, 1000);

// API Server
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/ekg') {
    try {
      const connection = await pool.getConnection();
      
      // Get current metrics
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      // Get spike detection
      const recentQueries = queryHistory.slice(-60); // Last minute
      const avgQps = recentQueries.reduce((a, b) => a + b, 0) / recentQueries.length;
      const maxQps = Math.max(...recentQueries);
      const isSpike = maxQps > avgQps * 3; // Spike if 3x average
      
      const metrics = {
        queryHistory: [...queryHistory.slice(historyIndex), ...queryHistory.slice(0, historyIndex)],
        lockHistory: [...lockHistory.slice(historyIndex), ...lockHistory.slice(0, historyIndex)],
        connectionHistory: [...connectionHistory.slice(historyIndex), ...connectionHistory.slice(0, historyIndex)],
        currentQps: queryHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
        currentConnections: parseInt(statusMap.Threads_connected) || 0,
        currentLocks: lockHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
        avgQps: Math.round(avgQps),
        maxQps: maxQps,
        isSpike: isSpike,
        timestamp: new Date().toISOString()
      };
      
      connection.release();
      res.end(JSON.stringify(metrics));
      
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server with EKG Display
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX EKG - Database Heartbeat Monitor</title>
  <style>
    body { 
      font-family: 'Courier New', monospace; 
      background: #000; 
      color: #0f0;
      margin: 0;
      padding: 20px;
      overflow: hidden;
    }
    
    h1 { 
      text-align: center; 
      color: #0f0;
      font-size: 36px;
      margin: 20px 0;
      text-shadow: 0 0 20px #0f0;
    }
    
    .monitor {
      background: #111;
      border: 2px solid #0f0;
      border-radius: 10px;
      padding: 20px;
      margin: 20px auto;
      max-width: 1600px;
      box-shadow: 0 0 30px rgba(0,255,0,0.3);
    }
    
    .ekg-container {
      position: relative;
      height: 200px;
      margin: 20px 0;
      background: #000;
      border: 1px solid #0f0;
      overflow: hidden;
    }
    
    canvas {
      width: 100%;
      height: 100%;
    }
    
    .ekg-label {
      position: absolute;
      top: 5px;
      left: 10px;
      color: #0f0;
      font-size: 14px;
      font-weight: bold;
      text-shadow: 0 0 5px #0f0;
    }
    
    .ekg-value {
      position: absolute;
      top: 5px;
      right: 10px;
      color: #0f0;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 0 10px #0f0;
    }
    
    .spike-alert {
      background: #ff0000;
      color: #fff;
      padding: 20px;
      text-align: center;
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
      animation: spike-flash 0.5s infinite;
      display: none;
    }
    
    .spike-alert.active {
      display: block;
    }
    
    @keyframes spike-flash {
      0%, 100% { opacity: 1; background: #ff0000; }
      50% { opacity: 0.7; background: #cc0000; }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    
    .stat-box {
      background: #111;
      border: 1px solid #0f0;
      padding: 20px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 48px;
      color: #0f0;
      font-weight: bold;
      text-shadow: 0 0 20px #0f0;
    }
    
    .stat-label {
      font-size: 16px;
      color: #0f0;
      margin-top: 10px;
    }
    
    .pattern-analysis {
      background: #111;
      border: 1px solid #0f0;
      padding: 20px;
      margin: 20px 0;
      font-size: 18px;
    }
    
    .pattern-analysis h2 {
      color: #0f0;
      margin-bottom: 15px;
    }
    
    .spike-history {
      color: #ff6600;
      font-weight: bold;
    }
    
    /* Grid lines effect */
    .ekg-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        repeating-linear-gradient(0deg, #0f0 0, #0f0 1px, transparent 1px, transparent 20px),
        repeating-linear-gradient(90deg, #0f0 0, #0f0 1px, transparent 1px, transparent 20px);
      opacity: 0.1;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <h1>💚 DREX EKG - DATABASE HEARTBEAT MONITOR 💚</h1>
  
  <div class="spike-alert" id="spikeAlert">
    ⚠️ QUERY SPIKE DETECTED! ⚠️
  </div>
  
  <div class="monitor">
    <div class="ekg-container">
      <div class="ekg-label">QUERIES/SEC</div>
      <div class="ekg-value" id="qpsValue">0</div>
      <canvas id="qpsEkg"></canvas>
    </div>
    
    <div class="ekg-container">
      <div class="ekg-label">CONNECTIONS</div>
      <div class="ekg-value" id="connValue">0</div>
      <canvas id="connEkg"></canvas>
    </div>
    
    <div class="ekg-container">
      <div class="ekg-label">LOCKS</div>
      <div class="ekg-value" id="lockValue">0</div>
      <canvas id="lockEkg"></canvas>
    </div>
  </div>
  
  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-value" id="avgQps">0</div>
      <div class="stat-label">AVG QPS (1 MIN)</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" id="maxQps">0</div>
      <div class="stat-label">PEAK QPS</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" id="spikeCount">0</div>
      <div class="stat-label">SPIKES DETECTED</div>
    </div>
  </div>
  
  <div class="pattern-analysis">
    <h2>PATTERN ANALYSIS</h2>
    <div id="patternInfo">Monitoring for spike patterns...</div>
  </div>
  
  <script>
    // EKG drawing function
    function drawEKG(canvas, data, max, color) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);
      
      // Draw EKG line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      
      ctx.beginPath();
      
      const step = width / data.length;
      data.forEach((value, i) => {
        const x = i * step;
        const y = height - (value / max) * height * 0.9 - 5;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Draw glow for current point
      const lastX = (data.length - 1) * step;
      const lastY = height - (data[data.length - 1] / max) * height * 0.9 - 5;
      
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    
    // Pattern detection
    let spikeCount = 0;
    let lastSpikeTime = 0;
    let spikeIntervals = [];
    
    function detectPatterns(data) {
      const spikes = [];
      const avg = data.avgQps;
      
      // Find spikes in history
      data.queryHistory.forEach((qps, i) => {
        if (qps > avg * 3 && i > 0 && data.queryHistory[i-1] < avg * 2) {
          spikes.push(i);
        }
      });
      
      // Analyze intervals
      if (spikes.length > 1) {
        const intervals = [];
        for (let i = 1; i < spikes.length; i++) {
          intervals.push(spikes[i] - spikes[i-1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const avgMinutes = Math.round(avgInterval / 60);
        
        return {
          spikeCount: spikes.length,
          avgInterval: avgMinutes,
          pattern: avgMinutes > 2 && avgMinutes < 4 ? 
            'CRITICAL: Spikes occurring every ~' + avgMinutes + ' minutes!' : 
            'Irregular spike pattern detected'
        };
      }
      
      return { spikeCount: 0, pattern: 'Monitoring...' };
    }
    
    // Update function
    function updateEKG() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/ekg')
        .then(r => r.json())
        .then(data => {
          // Update values
          document.getElementById('qpsValue').textContent = data.currentQps;
          document.getElementById('connValue').textContent = data.currentConnections;
          document.getElementById('lockValue').textContent = data.currentLocks;
          
          // Update stats
          document.getElementById('avgQps').textContent = data.avgQps;
          document.getElementById('maxQps').textContent = data.maxQps;
          
          // Draw EKGs
          const qpsCanvas = document.getElementById('qpsEkg');
          const connCanvas = document.getElementById('connEkg');
          const lockCanvas = document.getElementById('lockEkg');
          
          // Resize canvases if needed
          if (qpsCanvas.width !== qpsCanvas.offsetWidth) {
            qpsCanvas.width = qpsCanvas.offsetWidth;
            qpsCanvas.height = qpsCanvas.offsetHeight;
            connCanvas.width = connCanvas.offsetWidth;
            connCanvas.height = connCanvas.offsetHeight;
            lockCanvas.width = lockCanvas.offsetWidth;
            lockCanvas.height = lockCanvas.offsetHeight;
          }
          
          drawEKG(qpsCanvas, data.queryHistory, 5000, '#00ff00');
          drawEKG(connCanvas, data.connectionHistory, 100, '#00ffff');
          drawEKG(lockCanvas, data.lockHistory, 20, '#ff6600');
          
          // Spike alert
          if (data.isSpike) {
            document.getElementById('spikeAlert').classList.add('active');
            if (Date.now() - lastSpikeTime > 10000) {
              spikeCount++;
              lastSpikeTime = Date.now();
            }
          } else {
            document.getElementById('spikeAlert').classList.remove('active');
          }
          
          document.getElementById('spikeCount').textContent = spikeCount;
          
          // Pattern analysis
          const patterns = detectPatterns(data);
          const patternHtml = \`
            <div>Current State: <span style="color: \${data.isSpike ? '#ff0000' : '#00ff00'}">\${data.isSpike ? 'SPIKE ACTIVE!' : 'Normal'}</span></div>
            <div>Average QPS: \${data.avgQps}</div>
            <div>Peak QPS: <span style="color: #ff6600">\${data.maxQps}</span></div>
            <div class="spike-history">\${patterns.pattern}</div>
            <div style="margin-top: 10px; color: #666">Monitoring last 5 minutes of activity</div>
          \`;
          document.getElementById('patternInfo').innerHTML = patternHtml;
        })
        .catch(err => {
          console.error('Update error:', err);
        });
    }
    
    // Start monitoring
    updateEKG();
    setInterval(updateEKG, 1000);
  </script>
</body>
</html>
    `);
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Start servers
apiServer.listen(config.API_PORT, '0.0.0.0', () => {
  console.log('EKG API running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('EKG Monitor running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('💚 DREX EKG MONITOR STARTED 💚');
console.log('Tracking query spikes like a heartbeat monitor!');