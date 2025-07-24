// DREX ARCADE - High Score Monitor with Retro Style!
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

// High score tracking with IP addresses
const HIGH_SCORES_FILE = './arcade_scores.json';
let highScores = {
  topTen: [], // [{qps, time, date, ip, host}]
  todaysBest: null,
  currentSession: { qps: 0, startTime: new Date().toISOString() },
  totalGames: 0
};

// Load existing scores
if (fs.existsSync(HIGH_SCORES_FILE)) {
  try {
    highScores = JSON.parse(fs.readFileSync(HIGH_SCORES_FILE, 'utf8'));
    highScores.currentSession = { qps: 0, startTime: new Date().toISOString() };
  } catch (e) {
    console.log('Starting fresh arcade scores');
  }
}

function saveHighScores() {
  fs.writeFileSync(HIGH_SCORES_FILE, JSON.stringify(highScores, null, 2));
}

// Track current metrics
let currentQPS = 0;
let lastQuestions = 0;
let lastTime = Date.now();

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  connectionLimit: 10
});

// Sample every 500ms
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    const [[status]] = await connection.execute("SHOW STATUS LIKE 'Questions'");
    const [processList] = await connection.execute('SHOW PROCESSLIST');
    
    const currentQuestions = parseInt(status.Value);
    const currentTime = Date.now();
    
    // Calculate QPS
    if (lastQuestions > 0) {
      const timeDiff = (currentTime - lastTime) / 1000;
      currentQPS = Math.round((currentQuestions - lastQuestions) / timeDiff);
      
      // Update session high
      if (currentQPS > highScores.currentSession.qps) {
        highScores.currentSession.qps = currentQPS;
      }
      
      // Check for HIGH SCORE (over 1000 QPS qualifies)
      if (currentQPS > 1000) {
        const now = new Date();
        
        // Find the busiest connection source
        const ipCounts = {};
        processList.forEach(p => {
          if (p.Host && p.Host !== 'localhost') {
            const ip = p.Host.split(':')[0];
            ipCounts[ip] = (ipCounts[ip] || 0) + 1;
          }
        });
        
        const topIP = Object.entries(ipCounts).sort((a,b) => b[1] - a[1])[0];
        
        const newScore = {
          qps: currentQPS,
          time: now.toLocaleTimeString(),
          date: now.toLocaleDateString(),
          ip: topIP ? topIP[0] : 'UNKNOWN',
          host: topIP ? `${topIP[0]} (${topIP[1]} conn)` : 'UNKNOWN',
          timestamp: now.toISOString()
        };
        
        // Check if it makes top 10
        highScores.topTen.push(newScore);
        highScores.topTen.sort((a, b) => b.qps - a.qps);
        highScores.topTen = highScores.topTen.slice(0, 10);
        
        // Update today's best
        if (!highScores.todaysBest || currentQPS > highScores.todaysBest.qps) {
          highScores.todaysBest = newScore;
        }
        
        highScores.totalGames++;
        saveHighScores();
        
        console.log(`🎮 NEW HIGH SCORE: ${currentQPS} QPS from ${newScore.host}!`);
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
  
  if (req.url === '/api/arcade') {
    res.end(JSON.stringify({
      current: currentQPS,
      highScores: highScores,
      isPlaying: currentQPS > 100,
      timestamp: new Date().toISOString()
    }));
  }
});

// Web Server - ARCADE STYLE!
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX ARCADE - DATABASE DESTROYER</title>
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'Arcade';
      src: url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    }
    
    body { 
      font-family: 'Press Start 2P', 'Courier New', monospace;
      background: #000;
      color: #fff;
      margin: 0;
      padding: 0;
      overflow: hidden;
      image-rendering: pixelated;
      cursor: crosshair;
    }
    
    .arcade-cabinet {
      width: 100vw;
      height: 100vh;
      background: linear-gradient(to bottom, #1a1a2e 0%, #0f0f1e 50%, #16213e 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    
    .arcade-screen {
      background: #000;
      border: 20px solid #333;
      border-radius: 20px;
      box-shadow: 
        inset 0 0 100px rgba(0,255,0,0.3),
        0 0 50px rgba(0,255,0,0.5);
      margin: 20px;
      padding: 30px;
      position: relative;
      max-width: 1200px;
      width: 90%;
    }
    
    .arcade-screen::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0,255,0,0.03) 2px,
        rgba(0,255,0,0.03) 4px
      );
      pointer-events: none;
    }
    
    h1 {
      text-align: center;
      color: #ffff00;
      font-size: 36px;
      margin: 20px 0;
      text-shadow: 
        2px 2px 0 #ff00ff,
        4px 4px 0 #00ffff,
        6px 6px 10px rgba(0,0,0,0.5);
      animation: arcade-glow 2s ease-in-out infinite;
      letter-spacing: 3px;
    }
    
    @keyframes arcade-glow {
      0%, 100% { 
        text-shadow: 
          2px 2px 0 #ff00ff,
          4px 4px 0 #00ffff,
          6px 6px 10px rgba(0,0,0,0.5);
      }
      50% { 
        text-shadow: 
          2px 2px 0 #ff00ff,
          4px 4px 0 #00ffff,
          6px 6px 20px rgba(255,255,0,0.8);
      }
    }
    
    .current-game {
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      background: rgba(0,0,0,0.8);
      border: 3px solid #0f0;
      position: relative;
    }
    
    .current-game::before,
    .current-game::after {
      content: '◆';
      position: absolute;
      color: #ff0;
      font-size: 20px;
      animation: blink 1s infinite;
    }
    
    .current-game::before { left: 10px; }
    .current-game::after { right: 10px; }
    
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    .qps-display {
      font-size: 64px;
      color: #0f0;
      text-shadow: 0 0 20px #0f0;
      margin: 20px 0;
      letter-spacing: 5px;
    }
    
    .qps-display.danger {
      color: #f00;
      animation: danger-flash 0.3s infinite;
    }
    
    @keyframes danger-flash {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.1); }
    }
    
    .high-score-board {
      background: #000080;
      border: 4px solid #ffff00;
      padding: 20px;
      margin: 20px auto;
      position: relative;
    }
    
    .high-score-board h2 {
      color: #ffff00;
      text-align: center;
      font-size: 24px;
      margin-bottom: 20px;
      animation: flash 2s infinite;
    }
    
    @keyframes flash {
      0%, 100% { color: #ffff00; }
      50% { color: #ff00ff; }
    }
    
    .score-list {
      font-size: 14px;
      line-height: 2;
    }
    
    .score-entry {
      display: flex;
      justify-content: space-between;
      padding: 5px 10px;
      margin: 5px 0;
      background: rgba(0,0,0,0.5);
      border: 1px solid #00ff00;
      position: relative;
      overflow: hidden;
    }
    
    .score-entry.new {
      animation: new-score 1s ease-out;
    }
    
    @keyframes new-score {
      0% { 
        background: #ffff00;
        transform: scale(1.2);
      }
      100% { 
        background: rgba(0,0,0,0.5);
        transform: scale(1);
      }
    }
    
    .rank {
      color: #ff00ff;
      width: 40px;
    }
    
    .score-value {
      color: #00ff00;
      text-shadow: 0 0 5px #00ff00;
    }
    
    .score-player {
      color: #00ffff;
      flex: 1;
      text-align: center;
      font-size: 10px;
    }
    
    .score-date {
      color: #ffff00;
      font-size: 10px;
    }
    
    .insert-coin {
      position: absolute;
      bottom: 20px;
      right: 20px;
      color: #ff0000;
      font-size: 16px;
      animation: coin-blink 1s infinite;
    }
    
    @keyframes coin-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    .stats {
      display: flex;
      justify-content: space-around;
      margin: 20px 0;
      font-size: 12px;
    }
    
    .stat-box {
      text-align: center;
      padding: 10px;
      border: 2px solid #0f0;
      background: rgba(0,255,0,0.1);
    }
    
    .stat-label {
      color: #0f0;
      margin-bottom: 5px;
    }
    
    .stat-value {
      color: #fff;
      font-size: 20px;
      text-shadow: 0 0 10px currentColor;
    }
    
    /* Retro CRT effect */
    @keyframes flicker {
      0% { opacity: 0.97; }
      5% { opacity: 0.94; }
      10% { opacity: 0.98; }
      15% { opacity: 0.92; }
      20% { opacity: 0.98; }
      25% { opacity: 0.95; }
      30% { opacity: 0.99; }
      35% { opacity: 0.93; }
      40% { opacity: 0.97; }
      45% { opacity: 0.95; }
      50% { opacity: 0.98; }
      55% { opacity: 0.96; }
      60% { opacity: 0.99; }
      65% { opacity: 0.94; }
      70% { opacity: 0.97; }
      75% { opacity: 0.95; }
      80% { opacity: 0.99; }
      85% { opacity: 0.93; }
      90% { opacity: 0.96; }
      95% { opacity: 0.95; }
      100% { opacity: 0.98; }
    }
    
    .arcade-screen {
      animation: flicker 0.15s infinite;
    }
  </style>
</head>
<body>
  <div class="arcade-cabinet">
    <div class="arcade-screen">
      <h1>DATABASE DESTROYER</h1>
      
      <div class="current-game">
        <div style="color: #0f0; font-size: 16px; margin-bottom: 10px;">CURRENT ATTACK LEVEL</div>
        <div class="qps-display" id="currentQPS">0</div>
        <div style="color: #ff0; font-size: 12px;" id="gameStatus">INSERT QUERY TO PLAY</div>
      </div>
      
      <div class="stats">
        <div class="stat-box">
          <div class="stat-label">TODAY'S BEST</div>
          <div class="stat-value" id="todayBest">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">SESSION HIGH</div>
          <div class="stat-value" id="sessionHigh">0</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">ATTACKS TODAY</div>
          <div class="stat-value" id="totalGames">0</div>
        </div>
      </div>
      
      <div class="high-score-board">
        <h2>◆ HIGH SCORES ◆</h2>
        <div class="score-list" id="scoreList">
          <div class="score-entry">
            <span class="rank">---</span>
            <span class="score-value">LOADING...</span>
            <span class="score-player">-------------</span>
            <span class="score-date">--/--</span>
          </div>
        </div>
      </div>
      
      <div class="insert-coin">CREDIT: ∞</div>
    </div>
  </div>
  
  <audio id="newHighScore" preload="auto">
    <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSl+zPDThjMGHm7A7+OZURE" type="audio/wav">
  </audio>
  
  <script>
    let lastScores = [];
    let audioContext;
    
    function playBeep() {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    }
    
    function updateDisplay() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/arcade')
        .then(r => r.json())
        .then(data => {
          // Update current QPS
          const qpsElement = document.getElementById('currentQPS');
          qpsElement.textContent = data.current.toLocaleString();
          
          if (data.current > 5000) {
            qpsElement.className = 'qps-display danger';
            document.getElementById('gameStatus').textContent = 'CRITICAL OVERLOAD!!!';
          } else if (data.current > 1000) {
            qpsElement.className = 'qps-display';
            document.getElementById('gameStatus').textContent = 'ATTACK IN PROGRESS!';
            playBeep();
          } else if (data.current > 100) {
            qpsElement.className = 'qps-display';
            document.getElementById('gameStatus').textContent = 'WARMING UP...';
          } else {
            qpsElement.className = 'qps-display';
            document.getElementById('gameStatus').textContent = 'INSERT QUERY TO PLAY';
          }
          
          // Update stats
          document.getElementById('todayBest').textContent = 
            data.highScores.todaysBest ? data.highScores.todaysBest.qps.toLocaleString() : '0';
          document.getElementById('sessionHigh').textContent = 
            data.highScores.currentSession.qps.toLocaleString();
          document.getElementById('totalGames').textContent = data.highScores.totalGames;
          
          // Update high score list
          const scoreList = document.getElementById('scoreList');
          const scores = data.highScores.topTen;
          
          if (scores.length > 0) {
            const newScoreIds = scores.map(s => s.timestamp).join(',');
            const oldScoreIds = lastScores.map(s => s.timestamp).join(',');
            const hasNewScore = newScoreIds !== oldScoreIds && lastScores.length > 0;
            
            scoreList.innerHTML = scores.map((score, index) => {
              const isNew = hasNewScore && index === 0;
              return \`
                <div class="score-entry \${isNew ? 'new' : ''}">
                  <span class="rank">\${String(index + 1).padStart(2, '0')}.</span>
                  <span class="score-value">\${score.qps.toLocaleString()}</span>
                  <span class="score-player">\${score.host}</span>
                  <span class="score-date">\${score.time}</span>
                </div>
              \`;
            }).join('');
            
            lastScores = scores;
          }
        })
        .catch(err => console.error('Update error:', err));
    }
    
    // Update every 500ms
    updateDisplay();
    setInterval(updateDisplay, 500);
    
    // Add some retro effects
    document.addEventListener('click', playBeep);
  </script>
</body>
</html>
    `);
  }
});

// Start servers
apiServer.listen(config.API_PORT, '0.0.0.0', () => {
  console.log('🕹️  Arcade API on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('🎮 DREX ARCADE on port ' + config.WEB_PORT);
  console.log('');
  console.log('🏆 HIGH SCORE BOARD:');
  console.log('   - Shows TOP 10 attacks');
  console.log('   - Tracks IP addresses');
  console.log('   - Retro arcade style');
  console.log('   - Sound effects!');
  console.log('');
  console.log('👾 Play at: http://s01vpsromuls001:' + config.WEB_PORT);
});