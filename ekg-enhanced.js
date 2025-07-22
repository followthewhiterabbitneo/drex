// EKG ENHANCED - Jurassic Park Style with Lock Detection!
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
const orktagLocks = new Array(HISTORY_SIZE).fill(0);
let historyIndex = 0;
let lastQuestions = 0;
let lastTime = Date.now();
let tableActivityLog = [];

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
    
    // Analyze locks and table activity
    let totalLocks = 0;
    let orktagActivity = 0;
    const tableActivity = {};
    
    processList.forEach(p => {
      // Count locks
      if (p.State && (p.State.includes('lock') || p.State.includes('Lock') || p.State.includes('Waiting'))) {
        totalLocks++;
      }
      
      // Analyze query for table access
      if (p.Info) {
        const query = p.Info.toLowerCase();
        
        // Check for orktag table
        if (query.includes('orktag')) {
          orktagActivity++;
          if (p.State && p.State.includes('lock')) {
            // Log orktag lock event
            tableActivityLog.push({
              time: new Date().toISOString(),
              user: p.User,
              state: p.State,
              query: p.Info.substring(0, 100)
            });
            if (tableActivityLog.length > 20) tableActivityLog.shift();
          }
        }
        
        // Track all table activities
        const tableMatches = query.match(/(?:from|into|update|table)\s+(\w+)/gi);
        if (tableMatches) {
          tableMatches.forEach(match => {
            const table = match.replace(/^(from|into|update|table)\s+/i, '');
            tableActivity[table] = (tableActivity[table] || 0) + 1;
          });
        }
      }
    });
    
    // Update history
    queryHistory[historyIndex] = Math.min(qps, 5000);
    lockHistory[historyIndex] = totalLocks;
    connectionHistory[historyIndex] = parseInt(threads.Value);
    orktagLocks[historyIndex] = orktagActivity;
    
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

  if (req.url === '/api/ekg-enhanced') {
    try {
      const connection = await pool.getConnection();
      
      // Get current metrics and table locks
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      const [innodb] = await connection.execute("SHOW ENGINE INNODB STATUS");
      
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      // Parse InnoDB status for lock info
      let lockInfo = 'No lock information';
      if (innodb.length > 0 && innodb[0].Status) {
        const statusText = innodb[0].Status;
        if (statusText.includes('LATEST DETECTED DEADLOCK')) {
          lockInfo = 'DEADLOCK DETECTED!';
        } else if (statusText.includes('TRANSACTION')) {
          const lockMatches = statusText.match(/lock wait/gi);
          if (lockMatches) {
            lockInfo = `${lockMatches.length} transactions waiting for locks`;
          }
        }
      }
      
      // Get spike detection
      const recentQueries = queryHistory.slice(-60);
      const avgQps = recentQueries.reduce((a, b) => a + b, 0) / recentQueries.length;
      const maxQps = Math.max(...recentQueries);
      const isSpike = maxQps > avgQps * 3;
      
      // Check for orktag issues
      const recentOrktagActivity = orktagLocks.slice(-60);
      const orktagSpike = Math.max(...recentOrktagActivity) > 5;
      
      const metrics = {
        queryHistory: [...queryHistory.slice(historyIndex), ...queryHistory.slice(0, historyIndex)],
        lockHistory: [...lockHistory.slice(historyIndex), ...lockHistory.slice(0, historyIndex)],
        connectionHistory: [...connectionHistory.slice(historyIndex), ...connectionHistory.slice(0, historyIndex)],
        orktagHistory: [...orktagLocks.slice(historyIndex), ...orktagLocks.slice(0, historyIndex)],
        currentQps: queryHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
        currentConnections: parseInt(statusMap.Threads_connected) || 0,
        currentLocks: lockHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
        currentOrktagActivity: orktagLocks[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
        avgQps: Math.round(avgQps),
        maxQps: maxQps,
        isSpike: isSpike,
        orktagSpike: orktagSpike,
        lockInfo: lockInfo,
        tableActivityLog: tableActivityLog,
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

// Web Server with Jurassic Park EKG Display
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX EKG Enhanced - Database Vitals Monitor</title>
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
      letter-spacing: 3px;
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
      height: 180px;
      margin: 20px 0;
      background: #000;
      border: 1px solid #0f0;
      overflow: hidden;
    }
    
    .ekg-container.alert {
      border-color: #ff0000;
      animation: alert-pulse 1s infinite;
    }
    
    @keyframes alert-pulse {
      0%, 100% { box-shadow: 0 0 10px rgba(255,0,0,0.5); }
      50% { box-shadow: 0 0 30px rgba(255,0,0,0.8); }
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
      letter-spacing: 1px;
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
      letter-spacing: 2px;
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
      letter-spacing: 1px;
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
      letter-spacing: 2px;
    }
    
    .spike-history {
      color: #ff6600;
      font-weight: bold;
    }
    
    .orktag-alert {
      background: #440000;
      border: 2px solid #ff0000;
      padding: 15px;
      margin: 20px 0;
      display: none;
    }
    
    .orktag-alert.active {
      display: block;
      animation: blink 1s infinite;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .table-activity {
      background: #001100;
      border: 1px solid #0f0;
      padding: 15px;
      margin: 20px 0;
      max-height: 300px;
      overflow-y: auto;
      font-size: 12px;
    }
    
    .lock-event {
      background: #330000;
      border-left: 3px solid #ff0000;
      padding: 10px;
      margin: 5px 0;
      color: #ff6600;
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
    
    .system-label {
      position: absolute;
      bottom: 10px;
      right: 10px;
      color: #0f0;
      font-size: 12px;
      opacity: 0.7;
      letter-spacing: 2px;
    }
  </style>
</head>
<body>
  <h1>💚 DREX EKG ENHANCED - DATABASE VITALS MONITOR 💚</h1>
  
  <div class="spike-alert" id="spikeAlert">
    ⚠️ QUERY SPIKE DETECTED! ⚠️
  </div>
  
  <div class="orktag-alert" id="orktagAlert">
    🔒 ORKTAG TABLE LOCK DETECTED! TAG INSERTION BLOCKING! 🔒
  </div>
  
  <div class="monitor">
    <div class="ekg-container" id="qpsContainer">
      <div class="ekg-label">QUERIES/SEC</div>
      <div class="ekg-value" id="qpsValue">0</div>
      <canvas id="qpsEkg"></canvas>
      <div class="system-label">SYSTEM ALPHA</div>
    </div>
    
    <div class="ekg-container" id="connContainer">
      <div class="ekg-label">CONNECTIONS</div>
      <div class="ekg-value" id="connValue">0</div>
      <canvas id="connEkg"></canvas>
      <div class="system-label">SYSTEM BETA</div>
    </div>
    
    <div class="ekg-container" id="lockContainer">
      <div class="ekg-label">LOCK WAITS</div>
      <div class="ekg-value" id="lockValue">0</div>
      <canvas id="lockEkg"></canvas>
      <div class="system-label">SYSTEM GAMMA</div>
    </div>
    
    <div class="ekg-container" id="orktagContainer">
      <div class="ekg-label">ORKTAG ACTIVITY</div>
      <div class="ekg-value" id="orktagValue">0</div>
      <canvas id="orktagEkg"></canvas>
      <div class="system-label">SYSTEM DELTA</div>
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
      <div class="stat-value" id="lockInfo">SCANNING</div>
      <div class="stat-label">LOCK STATUS</div>
    </div>
  </div>
  
  <div class="pattern-analysis">
    <h2>PATTERN ANALYSIS</h2>
    <div id="patternInfo">Monitoring for spike patterns...</div>
  </div>
  
  <div class="table-activity">
    <h2 style="color: #0f0; margin-bottom: 10px;">ORKTAG TABLE ACTIVITY LOG</h2>
    <div id="tableLog">Monitoring table access...</div>
  </div>
  
  <script>
    // EKG drawing function - Jurassic Park style
    function drawEKG(canvas, data, max, color, isAlert = false) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear with fade effect for phosphor look
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, height);
      
      // Draw EKG line
      ctx.strokeStyle = isAlert ? '#ff0000' : color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = isAlert ? 20 : 10;
      ctx.shadowColor = isAlert ? '#ff0000' : color;
      
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
      ctx.fillStyle = isAlert ? '#ff0000' : color;
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
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/ekg-enhanced')
        .then(r => r.json())
        .then(data => {
          // Update values
          document.getElementById('qpsValue').textContent = data.currentQps;
          document.getElementById('connValue').textContent = data.currentConnections;
          document.getElementById('lockValue').textContent = data.currentLocks;
          document.getElementById('orktagValue').textContent = data.currentOrktagActivity;
          
          // Update stats
          document.getElementById('avgQps').textContent = data.avgQps;
          document.getElementById('maxQps').textContent = data.maxQps;
          document.getElementById('lockInfo').innerHTML = 
            \`<span style="font-size: 16px;">\${data.lockInfo}</span>\`;
          
          // Draw EKGs
          const qpsCanvas = document.getElementById('qpsEkg');
          const connCanvas = document.getElementById('connEkg');
          const lockCanvas = document.getElementById('lockEkg');
          const orktagCanvas = document.getElementById('orktagEkg');
          
          // Resize canvases if needed
          if (qpsCanvas.width !== qpsCanvas.offsetWidth) {
            qpsCanvas.width = qpsCanvas.offsetWidth;
            qpsCanvas.height = qpsCanvas.offsetHeight;
            connCanvas.width = connCanvas.offsetWidth;
            connCanvas.height = connCanvas.offsetHeight;
            lockCanvas.width = lockCanvas.offsetWidth;
            lockCanvas.height = lockCanvas.offsetHeight;
            orktagCanvas.width = orktagCanvas.offsetWidth;
            orktagCanvas.height = orktagCanvas.offsetHeight;
          }
          
          drawEKG(qpsCanvas, data.queryHistory, 5000, '#00ff00', data.isSpike);
          drawEKG(connCanvas, data.connectionHistory, 100, '#00ffff');
          drawEKG(lockCanvas, data.lockHistory, 20, '#ff6600', data.currentLocks > 5);
          drawEKG(orktagCanvas, data.orktagHistory, 20, '#ff00ff', data.orktagSpike);
          
          // Container alerts
          document.getElementById('qpsContainer').className = 
            data.isSpike ? 'ekg-container alert' : 'ekg-container';
          document.getElementById('lockContainer').className = 
            data.currentLocks > 5 ? 'ekg-container alert' : 'ekg-container';
          document.getElementById('orktagContainer').className = 
            data.orktagSpike ? 'ekg-container alert' : 'ekg-container';
          
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
          
          // Orktag alert
          if (data.orktagSpike || data.currentOrktagActivity > 5) {
            document.getElementById('orktagAlert').classList.add('active');
          } else {
            document.getElementById('orktagAlert').classList.remove('active');
          }
          
          // Pattern analysis
          const patterns = detectPatterns(data);
          const patternHtml = \`
            <div>Current State: <span style="color: \${data.isSpike ? '#ff0000' : '#00ff00'}">\${data.isSpike ? 'SPIKE ACTIVE!' : 'Normal'}</span></div>
            <div>Average QPS: \${data.avgQps}</div>
            <div>Peak QPS: <span style="color: #ff6600">\${data.maxQps}</span></div>
            <div class="spike-history">\${patterns.pattern}</div>
            <div style="margin-top: 10px;">
              <span style="color: \${data.orktagSpike ? '#ff00ff' : '#666'}">
                ORKTAG Status: \${data.orktagSpike ? 'HIGH ACTIVITY - POSSIBLE LOCKING!' : 'Normal'}
              </span>
            </div>
            <div style="margin-top: 10px; color: #666">Monitoring last 5 minutes of activity</div>
          \`;
          document.getElementById('patternInfo').innerHTML = patternHtml;
          
          // Table activity log
          if (data.tableActivityLog && data.tableActivityLog.length > 0) {
            const logHtml = data.tableActivityLog.map(event => \`
              <div class="lock-event">
                <strong>\${event.time}</strong><br>
                User: \${event.user} | State: \${event.state}<br>
                Query: \${event.query}
              </div>
            \`).join('');
            document.getElementById('tableLog').innerHTML = logHtml;
          }
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
  console.log('EKG Enhanced API running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('EKG Enhanced Monitor running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('💚 DREX EKG ENHANCED MONITOR STARTED 💚');
console.log('Tracking query spikes AND orktag table locking!');
console.log('Jurassic Park style - "They\'re adding tags... clever girl..."');