// RAPID SPIKE MONITOR - Catches spikes every 30 seconds!
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

// Shorter history for rapid spikes - 2 minutes
const HISTORY_SIZE = 120;
const queryHistory = new Array(HISTORY_SIZE).fill(0);
const spikeTimestamps = [];
let historyIndex = 0;
let lastQuestions = 0;
let lastTime = Date.now();
let rapidFireDetected = false;

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Sample FAST - every 500ms to catch rapid spikes
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    const [[status]] = await connection.execute("SHOW STATUS LIKE 'Questions'");
    
    const currentQuestions = parseInt(status.Value);
    const currentTime = Date.now();
    
    // Calculate QPS with high precision
    const timeDiff = (currentTime - lastTime) / 1000;
    const qps = lastQuestions > 0 && timeDiff > 0 ? 
      Math.round((currentQuestions - lastQuestions) / timeDiff) : 0;
    
    // Store every sample
    queryHistory[historyIndex] = qps;
    
    // Detect rapid spikes
    if (qps > 500) {
      const now = Date.now();
      spikeTimestamps.push(now);
      
      // Keep only last 10 spikes
      if (spikeTimestamps.length > 10) {
        spikeTimestamps.shift();
      }
      
      // Check for rapid pattern (multiple spikes within 60 seconds)
      const recentSpikes = spikeTimestamps.filter(ts => now - ts < 60000);
      rapidFireDetected = recentSpikes.length >= 2;
    }
    
    historyIndex = (historyIndex + 1) % HISTORY_SIZE;
    lastQuestions = currentQuestions;
    lastTime = currentTime;
    
    connection.release();
  } catch (err) {
    console.error('Sampling error:', err);
  }
}, 500); // Sample twice per second!

// API Server
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/rapid-spikes') {
    const recentHistory = [...queryHistory.slice(historyIndex), ...queryHistory.slice(0, historyIndex)];
    
    // Calculate spike intervals
    const intervals = [];
    for (let i = 1; i < spikeTimestamps.length; i++) {
      intervals.push((spikeTimestamps[i] - spikeTimestamps[i-1]) / 1000);
    }
    
    const avgInterval = intervals.length > 0 ?
      Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
    
    res.end(JSON.stringify({
      history: recentHistory,
      currentQps: recentHistory[recentHistory.length - 1],
      spikeCount: spikeTimestamps.length,
      avgInterval: avgInterval,
      rapidFire: rapidFireDetected,
      lastSpikes: spikeTimestamps.slice(-5).map(ts => new Date(ts).toLocaleTimeString()),
      timestamp: new Date().toISOString()
    }));
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server - RAPID FIRE DISPLAY
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>RAPID FIRE - 30 Second Spike Monitor</title>
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
      color: #ff0000;
      font-size: 42px;
      margin: 20px 0;
      text-shadow: 0 0 30px #ff0000;
      animation: pulse 0.5s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    .monitor {
      background: #111;
      border: 3px solid #ff0000;
      border-radius: 10px;
      padding: 20px;
      margin: 20px auto;
      max-width: 1400px;
      box-shadow: 0 0 40px rgba(255,0,0,0.5);
    }
    
    .rapid-display {
      position: relative;
      height: 400px;
      background: #000;
      border: 2px solid #0f0;
      margin: 20px 0;
      overflow: hidden;
    }
    
    canvas {
      width: 100%;
      height: 100%;
    }
    
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    
    .stat-box {
      background: #220000;
      border: 2px solid #ff0000;
      padding: 20px;
      text-align: center;
    }
    
    .big-number {
      font-size: 72px;
      font-weight: bold;
      color: #ff0000;
      text-shadow: 0 0 20px #ff0000;
    }
    
    .label {
      font-size: 18px;
      color: #ff6600;
      margin-top: 10px;
    }
    
    .rapid-alert {
      background: #ff0000;
      color: #000;
      padding: 30px;
      text-align: center;
      font-size: 36px;
      font-weight: bold;
      margin: 20px 0;
      display: none;
      animation: flash 0.2s infinite;
    }
    
    .rapid-alert.active {
      display: block;
    }
    
    @keyframes flash {
      0%, 100% { background: #ff0000; }
      50% { background: #ff6600; }
    }
    
    .spike-log {
      background: #001100;
      border: 2px solid #0f0;
      padding: 15px;
      margin: 20px 0;
      font-size: 16px;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .spike-time {
      color: #00ff00;
      font-weight: bold;
      margin: 5px 0;
    }
    
    .interval-display {
      font-size: 24px;
      color: #ffff00;
      text-align: center;
      margin: 20px 0;
    }
    
    /* Grid overlay */
    .rapid-display::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        repeating-linear-gradient(0deg, #0f0 0, #0f0 1px, transparent 1px, transparent 40px),
        repeating-linear-gradient(90deg, #0f0 0, #0f0 1px, transparent 1px, transparent 40px);
      opacity: 0.1;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <h1>🚨 RAPID FIRE MONITOR - EVERY 30 SECONDS! 🚨</h1>
  
  <div class="rapid-alert" id="rapidAlert">
    ⚡ RAPID SPIKES DETECTED! ⚡
  </div>
  
  <div class="monitor">
    <div class="rapid-display">
      <canvas id="rapidChart"></canvas>
    </div>
    
    <div class="stats-row">
      <div class="stat-box">
        <div class="big-number" id="currentQps">0</div>
        <div class="label">CURRENT QPS</div>
      </div>
      <div class="stat-box">
        <div class="big-number" id="spikeCount">0</div>
        <div class="label">SPIKES (2 MIN)</div>
      </div>
      <div class="stat-box">
        <div class="big-number" id="avgInterval">0</div>
        <div class="label">AVG INTERVAL (SEC)</div>
      </div>
    </div>
    
    <div class="interval-display" id="intervalDisplay">
      Monitoring for rapid spike pattern...
    </div>
    
    <div class="spike-log">
      <h3 style="color: #0f0; margin: 0 0 10px 0;">RECENT SPIKE TIMES:</h3>
      <div id="spikeLog">Waiting for spikes...</div>
    </div>
  </div>
  
  <script>
    function drawRapidChart(canvas, data) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear
      ctx.clearRect(0, 0, width, height);
      
      // Draw baseline
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      const baselineY = height - 50;
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      ctx.lineTo(width, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw data with VERY detailed resolution
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff00';
      
      ctx.beginPath();
      const step = width / data.length;
      
      data.forEach((value, i) => {
        const x = i * step;
        const normalized = Math.min(value / 3000, 1);
        const y = height - (normalized * (height - 60)) - 30;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        // Mark spikes with red dots
        if (value > 500) {
          ctx.save();
          ctx.fillStyle = '#ff0000';
          ctx.strokeStyle = '#ff0000';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#ff0000';
          
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Vertical spike line
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, height - 30);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.restore();
        }
      });
      
      ctx.stroke();
      
      // Time scale
      ctx.fillStyle = '#666';
      ctx.font = '14px Courier';
      ctx.fillText('Now', width - 30, height - 10);
      ctx.fillText('-2 min', 10, height - 10);
      ctx.fillText('-1 min', width/2 - 20, height - 10);
    }
    
    function update() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/rapid-spikes')
        .then(r => r.json())
        .then(data => {
          // Update numbers
          document.getElementById('currentQps').textContent = data.currentQps;
          document.getElementById('spikeCount').textContent = data.spikeCount;
          document.getElementById('avgInterval').textContent = data.avgInterval;
          
          // Show alert for rapid fire
          if (data.rapidFire) {
            document.getElementById('rapidAlert').classList.add('active');
          } else {
            document.getElementById('rapidAlert').classList.remove('active');
          }
          
          // Update interval display
          if (data.avgInterval > 0 && data.avgInterval < 60) {
            document.getElementById('intervalDisplay').innerHTML = 
              \`<span style="color: #ff0000; font-size: 36px;">
                SPIKES EVERY \${data.avgInterval} SECONDS!
              </span>\`;
          }
          
          // Update spike log
          if (data.lastSpikes.length > 0) {
            const logHtml = data.lastSpikes.map(time => 
              \`<div class="spike-time">🔥 Spike at \${time}</div>\`
            ).join('');
            document.getElementById('spikeLog').innerHTML = logHtml;
          }
          
          // Draw chart
          const canvas = document.getElementById('rapidChart');
          if (canvas.width !== canvas.offsetWidth) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
          }
          
          drawRapidChart(canvas, data.history);
        })
        .catch(err => console.error('Update error:', err));
    }
    
    // Update FAST
    update();
    setInterval(update, 500); // Update twice per second!
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
  console.log('Rapid Spike API on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('RAPID FIRE MONITOR on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('🚨 RAPID FIRE MONITOR STARTED 🚨');
console.log('Catching spikes every 30 seconds!');
console.log('Sampling twice per second for maximum precision!');