// DREX HIGH SCORE MONITOR - Tracks daily records!
const mysql = require('mysql2/promise');
const http = require('http');
const fs = require('fs');

const config = {
  DB_HOST: 's01vpsoxweb010',
  DB_PORT: 3306,
  DB_NAME: 'oreka',
  DB_USER: 'DEA',
  DB_PASS: 'hotchip',
  API_PORT: 3001,
  WEB_PORT: 3000
};

// High score tracking
const HIGH_SCORES_FILE = './high_scores.json';
let highScores = {
  today: { qps: 0, time: null, connections: 0 },
  allTime: { qps: 0, time: null, date: null }, // Will set when we have evidence
  lastHour: { qps: 0, time: null },
  sessionHigh: { qps: 0, time: null }, // Track this session's high
  spikesCount: 0,
  history: []
};

// Load existing high scores
if (fs.existsSync(HIGH_SCORES_FILE)) {
  try {
    highScores = JSON.parse(fs.readFileSync(HIGH_SCORES_FILE, 'utf8'));
  } catch (e) {
    console.log('Starting fresh high scores');
  }
}

// Reset daily high score at midnight
function checkDailyReset() {
  const now = new Date();
  const today = now.toDateString();
  if (highScores.today.date !== today) {
    highScores.today = { qps: 0, time: null, connections: 0, date: today };
    saveHighScores();
  }
}

function saveHighScores() {
  fs.writeFileSync(HIGH_SCORES_FILE, JSON.stringify(highScores, null, 2));
}

// Track current metrics
let currentQPS = 0;
let lastQuestions = 0;
let lastTime = Date.now();
const recentQPS = [];

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  connectionLimit: 10
});

// Sample every 500ms for accuracy
setInterval(async () => {
  try {
    checkDailyReset();
    
    const connection = await pool.getConnection();
    const [[status]] = await connection.execute("SHOW STATUS LIKE 'Questions'");
    const [[threads]] = await connection.execute("SHOW STATUS LIKE 'Threads_connected'");
    
    const currentQuestions = parseInt(status.Value);
    const currentTime = Date.now();
    const connections = parseInt(threads.Value);
    
    // Calculate QPS
    if (lastQuestions > 0) {
      const timeDiff = (currentTime - lastTime) / 1000;
      currentQPS = Math.round((currentQuestions - lastQuestions) / timeDiff);
      
      // Track recent QPS
      recentQPS.push(currentQPS);
      if (recentQPS.length > 120) recentQPS.shift(); // Keep 1 minute
      
      // Check for new high scores
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      
      // NEW DAILY HIGH SCORE!
      if (currentQPS > highScores.today.qps) {
        highScores.today = { 
          qps: currentQPS, 
          time: timeStr, 
          connections: connections,
          date: now.toDateString()
        };
        console.log(`🏆 NEW DAILY HIGH: ${currentQPS} QPS at ${timeStr}!`);
      }
      
      // Track session high (not saving as all-time yet)
      if (currentQPS > highScores.sessionHigh.qps) {
        highScores.sessionHigh = { 
          qps: currentQPS, 
          time: timeStr
        };
        console.log(`📈 NEW SESSION HIGH: ${currentQPS} QPS at ${timeStr}!`);
      }
      
      // We'll set all-time record when we have evidence collector running
      // For now, just note if it would beat 29K
      if (currentQPS > 29000) {
        console.log(`🚨 MASSIVE SPIKE: ${currentQPS} QPS - Need evidence collector!`);
      }
      
      // Last hour high
      const hourAgo = Date.now() - 3600000;
      if (currentQPS > highScores.lastHour.qps || !highScores.lastHour.timestamp || highScores.lastHour.timestamp < hourAgo) {
        highScores.lastHour = { 
          qps: currentQPS, 
          time: timeStr,
          timestamp: Date.now()
        };
      }
      
      // Count spikes over 1000 QPS
      if (currentQPS > 1000) {
        highScores.spikesCount++;
        highScores.history.push({
          qps: currentQPS,
          time: timeStr,
          date: now.toDateString()
        });
        if (highScores.history.length > 100) highScores.history.shift();
        saveHighScores();
      }
    }
    
    lastQuestions = currentQuestions;
    lastTime = currentTime;
    connection.release();
    
  } catch (err) {
    console.error('Sampling error:', err.message);
  }
}, 500);

// API Server
const apiServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/api/highscores') {
    const avgQPS = recentQPS.length > 0 ? 
      Math.round(recentQPS.reduce((a,b) => a+b, 0) / recentQPS.length) : 0;
    
    res.end(JSON.stringify({
      current: currentQPS,
      average: avgQPS,
      highScores: highScores,
      isSpike: currentQPS > 1000,
      timestamp: new Date().toISOString()
    }));
  }
});

// Web Server with HIGH SCORE DISPLAY
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX HIGH SCORE TRACKER</title>
  <style>
    body { 
      font-family: 'Arial Black', Arial, sans-serif; 
      background: #000; 
      color: #0f0;
      margin: 0;
      padding: 20px;
      overflow: hidden;
    }
    
    h1 { 
      text-align: center; 
      color: #0f0;
      font-size: 48px;
      margin: 20px 0;
      text-shadow: 0 0 30px #0f0;
      animation: glow 2s ease-in-out infinite;
    }
    
    @keyframes glow {
      0%, 100% { text-shadow: 0 0 30px #0f0; }
      50% { text-shadow: 0 0 50px #0f0, 0 0 70px #0f0; }
    }
    
    .highscore-board {
      background: linear-gradient(135deg, #111 0%, #222 100%);
      border: 4px solid #0f0;
      border-radius: 20px;
      padding: 30px;
      margin: 20px auto;
      max-width: 1200px;
      box-shadow: 0 0 50px rgba(0,255,0,0.5);
    }
    
    .current-stats {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .current-qps {
      font-size: 120px;
      font-weight: bold;
      margin: 20px 0;
      text-shadow: 0 0 20px currentColor;
      transition: all 0.3s;
    }
    
    .current-qps.normal { color: #0f0; }
    .current-qps.warning { color: #ff0; animation: pulse 1s infinite; }
    .current-qps.danger { color: #f00; animation: shake 0.5s infinite; }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
    
    .highscore-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 30px;
      margin-top: 30px;
    }
    
    .score-box {
      background: rgba(0,255,0,0.1);
      border: 2px solid #0f0;
      border-radius: 15px;
      padding: 25px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .score-box::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(45deg, transparent, rgba(0,255,0,0.1), transparent);
      animation: shine 3s infinite;
    }
    
    @keyframes shine {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .score-label {
      font-size: 24px;
      color: #0f0;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .score-value {
      font-size: 64px;
      font-weight: bold;
      color: #fff;
      text-shadow: 0 0 20px #0f0;
      margin: 10px 0;
    }
    
    .score-time {
      font-size: 18px;
      color: #0f0;
      opacity: 0.8;
    }
    
    .new-record {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 80px;
      color: #ff0;
      text-shadow: 0 0 50px #ff0;
      animation: record-flash 1s ease-out;
      z-index: 1000;
      display: none;
    }
    
    .new-record.show {
      display: block;
    }
    
    @keyframes record-flash {
      0% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
      50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    
    .spike-counter {
      text-align: center;
      margin-top: 30px;
      font-size: 24px;
    }
    
    .spike-count {
      font-size: 48px;
      color: #ff6600;
      font-weight: bold;
    }
    
    .history-ticker {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #111;
      border-top: 2px solid #0f0;
      padding: 10px;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
    }
    
    .history-text {
      display: inline-block;
      padding-left: 100%;
      animation: scroll 30s linear infinite;
    }
    
    @keyframes scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
  </style>
</head>
<body>
  <h1>🏆 DREX HIGH SCORE TRACKER 🏆</h1>
  
  <div class="highscore-board">
    <div class="current-stats">
      <div>CURRENT QUERIES/SECOND</div>
      <div class="current-qps" id="currentQPS">0</div>
      <div id="currentStatus">Monitoring...</div>
    </div>
    
    <div class="highscore-grid">
      <div class="score-box">
        <div class="score-label">📅 Today's High Score</div>
        <div class="score-value" id="todayHigh">0</div>
        <div class="score-time" id="todayTime">--:--:--</div>
      </div>
      
      <div class="score-box">
        <div class="score-label">📈 SESSION HIGH</div>
        <div class="score-value" id="sessionHigh">0</div>
        <div class="score-time" id="sessionTime">--:--:--</div>
      </div>
      
      <div class="score-box">
        <div class="score-label">⏰ Last Hour Peak</div>
        <div class="score-value" id="hourHigh">0</div>
        <div class="score-time" id="hourTime">--:--:--</div>
      </div>
    </div>
    
    <div class="spike-counter">
      <div>SPIKES DETECTED TODAY</div>
      <div class="spike-count" id="spikeCount">0</div>
    </div>
  </div>
  
  <div class="new-record" id="newRecord">NEW RECORD!</div>
  
  <div class="history-ticker">
    <div class="history-text" id="historyText">Loading spike history...</div>
  </div>
  
  <script>
    let lastDailyHigh = 0;
    let lastAllTimeHigh = 0;
    
    function updateDisplay() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/highscores')
        .then(r => r.json())
        .then(data => {
          // Update current QPS with color coding
          const qpsElement = document.getElementById('currentQPS');
          qpsElement.textContent = data.current.toLocaleString();
          
          qpsElement.className = 'current-qps';
          if (data.current > 5000) {
            qpsElement.className += ' danger';
            document.getElementById('currentStatus').textContent = '🚨 EXTREME SPIKE DETECTED!';
          } else if (data.current > 1000) {
            qpsElement.className += ' warning';
            document.getElementById('currentStatus').textContent = '⚠️ SPIKE IN PROGRESS!';
          } else {
            qpsElement.className += ' normal';
            document.getElementById('currentStatus').textContent = 'Normal Activity (Avg: ' + data.average + ' QPS)';
          }
          
          // Update high scores
          document.getElementById('todayHigh').textContent = data.highScores.today.qps.toLocaleString();
          document.getElementById('todayTime').textContent = data.highScores.today.time || '--:--:--';
          
          document.getElementById('sessionHigh').textContent = data.highScores.sessionHigh.qps.toLocaleString();
          document.getElementById('sessionTime').textContent = data.highScores.sessionHigh.time || '--:--:--';
          
          document.getElementById('hourHigh').textContent = data.highScores.lastHour.qps.toLocaleString();
          document.getElementById('hourTime').textContent = data.highScores.lastHour.time || '--:--:--';
          
          document.getElementById('spikeCount').textContent = data.highScores.spikesCount;
          
          // Check for new records
          if (data.highScores.today.qps > lastDailyHigh && lastDailyHigh > 0) {
            showNewRecord();
          }
          lastDailyHigh = data.highScores.today.qps;
          
          // Session high tracking
          if (data.highScores.sessionHigh.qps > 10000) {
            document.getElementById('sessionHigh').style.color = '#ff0000';
            document.getElementById('sessionHigh').style.animation = 'pulse 1s infinite';
          }
          
          // Update history ticker
          if (data.highScores.history && data.highScores.history.length > 0) {
            const historyText = data.highScores.history
              .map(h => h.qps.toLocaleString() + ' QPS at ' + h.time)
              .join(' • ');
            document.getElementById('historyText').textContent = 'Recent Spikes: ' + historyText + ' • ';
          }
        })
        .catch(err => console.error('Update error:', err));
    }
    
    function showNewRecord() {
      const record = document.getElementById('newRecord');
      record.classList.add('show');
      setTimeout(() => record.classList.remove('show'), 1000);
    }
    
    // Update every 500ms
    updateDisplay();
    setInterval(updateDisplay, 500);
  </script>
</body>
</html>
    `);
  }
});

// Start servers
apiServer.listen(config.API_PORT, '0.0.0.0', () => {
  console.log('🏆 High Score API on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('🏆 HIGH SCORE TRACKER on port ' + config.WEB_PORT);
  console.log('');
  console.log('📊 Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
  console.log('');
  console.log('🎯 Tracking:');
  console.log('   - Daily High Score');
  console.log('   - All-Time Record');
  console.log('   - Last Hour Peak');
  console.log('   - Total Spike Count');
  console.log('');
  console.log('💾 High scores saved to: ' + HIGH_SCORES_FILE);
});

console.log('');
console.log('Current high scores:', highScores);