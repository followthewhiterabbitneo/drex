// SMOKING GUN MONITOR - Shows the OBVIOUS problem!
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

// Track the EVIDENCE
const HISTORY_SIZE = 360; // 6 minutes to catch multiple spikes
const queryHistory = new Array(HISTORY_SIZE).fill(0);
let historyIndex = 0;
let lastQuestions = 0;
let lastTime = Date.now();
let spikeDetected = false;
let lastSpikeTime = 0;
let spikePattern = [];

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Sample every second
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    const [[status]] = await connection.execute("SHOW STATUS LIKE 'Questions'");
    
    const currentQuestions = parseInt(status.Value);
    const currentTime = Date.now();
    
    // Calculate QPS
    const qps = lastQuestions > 0 ? 
      Math.round((currentQuestions - lastQuestions) / ((currentTime - lastTime) / 1000)) : 0;
    
    // Store in history
    queryHistory[historyIndex] = qps;
    
    // SPIKE DETECTION - the smoking gun!
    if (qps > 1000 && queryHistory[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE] < 200) {
      spikeDetected = true;
      const now = Date.now();
      if (lastSpikeTime > 0) {
        const interval = Math.round((now - lastSpikeTime) / 1000);
        spikePattern.push(interval);
        if (spikePattern.length > 10) spikePattern.shift();
      }
      lastSpikeTime = now;
    } else if (qps < 200) {
      spikeDetected = false;
    }
    
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

  if (req.url === '/api/smoking-gun') {
    // Get the evidence
    const recentHistory = [...queryHistory.slice(historyIndex), ...queryHistory.slice(0, historyIndex)];
    const currentQps = recentHistory[recentHistory.length - 1];
    
    // Calculate baseline (exclude spikes)
    const normalValues = recentHistory.filter(q => q < 500);
    const baseline = normalValues.length > 0 ? 
      Math.round(normalValues.reduce((a, b) => a + b, 0) / normalValues.length) : 0;
    
    // Find max spike
    const maxSpike = Math.max(...recentHistory);
    
    // Average spike interval
    const avgInterval = spikePattern.length > 0 ?
      Math.round(spikePattern.reduce((a, b) => a + b, 0) / spikePattern.length) : 0;
    
    res.end(JSON.stringify({
      history: recentHistory,
      currentQps: currentQps,
      baseline: baseline,
      maxSpike: maxSpike,
      isSpike: spikeDetected,
      avgSpikeInterval: avgInterval,
      spikePattern: spikePattern,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server - THE EVIDENCE DISPLAY
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>SMOKING GUN - Database Spike Evidence</title>
  <style>
    body { 
      font-family: 'Arial Black', sans-serif; 
      background: #000; 
      color: #fff;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    
    h1 { 
      font-size: 48px;
      margin: 20px 0;
      color: #ff0000;
      text-shadow: 0 0 20px #ff0000;
    }
    
    .evidence-box {
      background: #111;
      border: 4px solid #ff0000;
      border-radius: 20px;
      padding: 30px;
      margin: 20px auto;
      max-width: 1200px;
      box-shadow: 0 0 50px rgba(255,0,0,0.5);
    }
    
    .current-status {
      font-size: 120px;
      font-weight: bold;
      margin: 30px 0;
      transition: all 0.3s;
    }
    
    .normal {
      color: #00ff00;
      text-shadow: 0 0 30px #00ff00;
    }
    
    .spike {
      color: #ff0000;
      text-shadow: 0 0 50px #ff0000;
      animation: pulse 0.5s infinite;
      transform: scale(1.2);
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1.2); }
      50% { transform: scale(1.3); }
    }
    
    .baseline-info {
      font-size: 36px;
      color: #00ff00;
      margin: 20px 0;
    }
    
    .spike-info {
      font-size: 36px;
      color: #ff0000;
      margin: 20px 0;
    }
    
    canvas {
      width: 100%;
      height: 400px;
      border: 2px solid #fff;
      margin: 30px 0;
      background: #000;
    }
    
    .pattern-box {
      background: #220000;
      border: 3px solid #ff0000;
      padding: 20px;
      margin: 20px 0;
      font-size: 28px;
    }
    
    .smoking-gun {
      font-size: 64px;
      color: #ff0000;
      font-weight: bold;
      animation: blink 1s infinite;
      margin: 30px 0;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .evidence-label {
      font-size: 24px;
      color: #ffff00;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <h1>🔫 SMOKING GUN - DATABASE SPIKE EVIDENCE 🔫</h1>
  
  <div class="evidence-box">
    <div class="evidence-label">CURRENT QUERIES/SECOND:</div>
    <div id="currentStatus" class="current-status normal">0</div>
    
    <canvas id="evidenceChart"></canvas>
    
    <div class="baseline-info">
      NORMAL BASELINE: <span id="baseline">0</span> queries/sec
      <br>
      <span style="font-size: 20px; color: #666;">
        (Even with 500 concurrent calls - NO PROBLEM!)
      </span>
    </div>
    
    <div class="spike-info">
      SPIKE MAXIMUM: <span id="maxSpike">0</span> queries/sec
      <br>
      <span style="font-size: 20px;">
        (WHAMMO! In literally 1 second!)
      </span>
    </div>
    
    <div class="pattern-box">
      <div class="evidence-label">THE PATTERN:</div>
      <div id="spikePattern">Collecting evidence...</div>
    </div>
    
    <div id="smokingGun" class="smoking-gun" style="display: none;">
      ⚠️ EVERY ~3 MINUTES LIKE CLOCKWORK! ⚠️
    </div>
  </div>
  
  <script>
    let chart = null;
    
    function drawEvidence(canvas, data) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      // Draw baseline line
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      const baselineY = height - 50;
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      ctx.lineTo(width, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label baseline
      ctx.fillStyle = '#00ff00';
      ctx.font = '16px Arial';
      ctx.fillText('NORMAL', 10, baselineY - 5);
      
      // Draw the data
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      
      ctx.beginPath();
      const step = width / data.length;
      
      data.forEach((value, i) => {
        const x = i * step;
        const normalized = Math.min(value / 5000, 1); // Cap at 5000
        const y = height - (normalized * (height - 60)) - 30;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        // Highlight spikes in RED
        if (value > 1000) {
          ctx.save();
          ctx.fillStyle = '#ff0000';
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw spike line
          ctx.beginPath();
          ctx.moveTo(x, height - 30);
          ctx.lineTo(x, y);
          ctx.stroke();
          
          // Label the spike
          ctx.font = 'bold 20px Arial';
          ctx.fillText(value + '!', x - 20, y - 15);
          ctx.restore();
        }
      });
      
      ctx.stroke();
      
      // Time labels
      ctx.fillStyle = '#666';
      ctx.font = '14px Arial';
      ctx.fillText('Now', width - 30, height - 5);
      ctx.fillText('-6 min', 10, height - 5);
    }
    
    function update() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/smoking-gun')
        .then(r => r.json())
        .then(data => {
          // Update current value
          const statusEl = document.getElementById('currentStatus');
          statusEl.textContent = data.currentQps;
          
          if (data.isSpike) {
            statusEl.className = 'current-status spike';
          } else {
            statusEl.className = 'current-status normal';
          }
          
          // Update stats
          document.getElementById('baseline').textContent = data.baseline;
          document.getElementById('maxSpike').textContent = data.maxSpike;
          
          // Show pattern
          if (data.avgSpikeInterval > 0) {
            const minutes = Math.round(data.avgSpikeInterval / 60);
            document.getElementById('spikePattern').innerHTML = 
              \`SPIKES DETECTED EVERY <span style="color: #ff0000; font-size: 48px;">\${minutes}</span> MINUTES!\`;
            
            if (minutes >= 2 && minutes <= 4) {
              document.getElementById('smokingGun').style.display = 'block';
            }
          }
          
          // Draw chart
          const canvas = document.getElementById('evidenceChart');
          if (canvas.width !== canvas.offsetWidth) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
          }
          
          drawEvidence(canvas, data.history);
        })
        .catch(err => console.error('Update error:', err));
    }
    
    // Start monitoring
    update();
    setInterval(update, 1000);
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
  console.log('Smoking Gun API on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('SMOKING GUN MONITOR on port ' + config.WEB_PORT);
  console.log('Evidence at: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('🔫 SMOKING GUN MONITOR STARTED 🔫');
console.log('Proving the OBVIOUS - normal baseline then WHAMMO!');