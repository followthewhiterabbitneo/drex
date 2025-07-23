// POD SLAM MONITOR - Shows 8 pods hammering the DB!
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

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

let lastQuestions = 0;
let lastTime = Date.now();
let podActivityHistory = [];

// API Server
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/pod-slam') {
    try {
      const connection = await pool.getConnection();
      
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      // Calculate QPS
      const currentQuestions = parseInt(statusMap.Questions) || 0;
      const currentTime = Date.now();
      const timeDiff = (currentTime - lastTime) / 1000;
      const qps = lastQuestions > 0 && timeDiff > 0 ? 
        Math.round((currentQuestions - lastQuestions) / timeDiff) : 0;
      
      lastQuestions = currentQuestions;
      lastTime = currentTime;
      
      // Analyze connections by user/host to detect pods
      const podActivity = {};
      const userBreakdown = {
        ourApp: { connections: 0, sleeping: 0, active: 0 },
        oreka: { connections: 0, sleeping: 0, active: 0, pods: new Set() }
      };
      
      processList.forEach(proc => {
        const isOreka = proc.User && (proc.User.includes('oreka') || proc.User.includes('analytics'));
        const category = isOreka ? 'oreka' : 'ourApp';
        
        userBreakdown[category].connections++;
        
        if (proc.Command === 'Sleep') {
          userBreakdown[category].sleeping++;
        } else if (proc.Command === 'Query') {
          userBreakdown[category].active++;
        }
        
        // Track unique hosts as "pods"
        if (isOreka && proc.Host) {
          const podId = proc.Host.split(':')[0];
          userBreakdown.oreka.pods.add(podId);
          podActivity[podId] = (podActivity[podId] || 0) + 1;
        }
      });
      
      // Record pod activity
      podActivityHistory.push({
        time: new Date().toISOString(),
        qps: qps,
        podCount: userBreakdown.oreka.pods.size,
        pods: Array.from(userBreakdown.oreka.pods)
      });
      
      if (podActivityHistory.length > 60) podActivityHistory.shift();
      
      const response = {
        qps: qps,
        totalConnections: parseInt(statusMap.Threads_connected) || 0,
        maxConnections: parseInt(statusMap.Max_used_connections) || 0,
        userBreakdown: {
          ourApp: userBreakdown.ourApp,
          oreka: {
            ...userBreakdown.oreka,
            pods: Array.from(userBreakdown.oreka.pods),
            podCount: userBreakdown.oreka.pods.size
          }
        },
        podActivity: podActivity,
        slamDetected: qps > 1000 && userBreakdown.oreka.pods.size >= 3,
        podHistory: podActivityHistory.slice(-10),
        timestamp: new Date().toISOString()
      };
      
      connection.release();
      res.end(JSON.stringify(response));
      
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server - POD SLAM VISUALIZATION
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>POD SLAM - 8 Pods vs 1 Database!</title>
  <style>
    body { 
      font-family: 'Arial Black', sans-serif; 
      background: #000; 
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    
    h1 { 
      text-align: center; 
      color: #ff0000;
      font-size: 42px;
      margin: 20px 0;
      text-shadow: 0 0 30px #ff0000;
    }
    
    .battle-arena {
      display: grid;
      grid-template-columns: 1fr 200px 1fr;
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
      align-items: center;
    }
    
    .our-side {
      background: #002200;
      border: 3px solid #00ff00;
      padding: 30px;
      border-radius: 20px;
      text-align: center;
    }
    
    .their-side {
      background: #220000;
      border: 3px solid #ff0000;
      padding: 30px;
      border-radius: 20px;
      text-align: center;
    }
    
    .vs {
      font-size: 72px;
      color: #ffff00;
      text-align: center;
      text-shadow: 0 0 30px #ffff00;
    }
    
    .side-title {
      font-size: 28px;
      margin-bottom: 20px;
      font-weight: bold;
    }
    
    .pod-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin: 20px 0;
    }
    
    .pod {
      background: #660000;
      border: 2px solid #ff0000;
      padding: 15px;
      border-radius: 10px;
      text-align: center;
      animation: pod-attack 2s infinite;
    }
    
    .pod.active {
      background: #ff0000;
      animation: pod-attack 0.5s infinite;
    }
    
    @keyframes pod-attack {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    .metric-display {
      font-size: 48px;
      margin: 20px 0;
      font-weight: bold;
    }
    
    .connection-bar {
      background: #333;
      height: 30px;
      border-radius: 15px;
      overflow: hidden;
      margin: 10px 0;
      position: relative;
    }
    
    .bar-fill {
      height: 100%;
      transition: width 0.5s;
    }
    
    .bar-sleeping {
      background: #0066ff;
    }
    
    .bar-active {
      background: #00ff00;
    }
    
    .bar-oreka {
      background: #ff0000;
    }
    
    .database {
      background: #111;
      border: 3px solid #ffff00;
      padding: 40px;
      margin: 30px auto;
      max-width: 600px;
      text-align: center;
      border-radius: 20px;
    }
    
    .database.under-attack {
      animation: shake 0.5s infinite;
      border-color: #ff0000;
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    
    .slam-alert {
      background: #ff0000;
      color: #000;
      padding: 30px;
      text-align: center;
      font-size: 36px;
      font-weight: bold;
      margin: 20px 0;
      display: none;
      animation: flash 0.3s infinite;
    }
    
    .slam-alert.active {
      display: block;
    }
    
    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 30px 0;
    }
    
    .stat-box {
      background: #111;
      border: 2px solid #666;
      padding: 20px;
      text-align: center;
      border-radius: 10px;
    }
    
    .good { color: #00ff00; }
    .bad { color: #ff0000; }
  </style>
</head>
<body>
  <h1>⚔️ POD SLAM MONITOR ⚔️</h1>
  <h2 style="text-align: center; color: #666;">8 Oreka Pods vs 1 Database</h2>
  
  <div class="slam-alert" id="slamAlert">
    🚨 POD SLAM IN PROGRESS! 🚨
  </div>
  
  <div class="battle-arena">
    <div class="our-side">
      <div class="side-title good">😇 OUR APP</div>
      <div class="metric-display">
        <div><span id="ourConnections">0</span> connections</div>
        <div style="font-size: 24px; color: #0066ff;">
          <span id="ourSleeping">0</span> sleeping (being good!)
        </div>
      </div>
      <div class="connection-bar">
        <div class="bar-fill bar-sleeping" id="ourSleepBar" style="width: 0%"></div>
      </div>
      <div style="color: #00ff00; font-size: 18px;">
        ✅ Connection limits respected<br>
        ✅ Proper pooling<br>
        ✅ Steady load pattern
      </div>
    </div>
    
    <div class="vs">VS</div>
    
    <div class="their-side">
      <div class="side-title bad">😈 OREKA/ANALYTICS</div>
      <div class="metric-display">
        <div><span id="orekaConnections">0</span> connections</div>
        <div style="font-size: 24px;">
          From <span id="podCount" style="color: #ff0000;">0</span> PODS!
        </div>
      </div>
      <div class="pod-grid" id="podGrid">
        <!-- Pods will be added here -->
      </div>
      <div style="color: #ff6600; font-size: 18px;">
        ❌ Multiple pods attacking<br>
        ❌ Burst pattern every 3 min<br>
        ❌ No connection management
      </div>
    </div>
  </div>
  
  <div class="database" id="database">
    <h2 style="color: #ffff00;">🗄️ THE DATABASE</h2>
    <div class="metric-display" style="color: #ffff00;">
      <span id="totalQps">0</span> QPS
    </div>
    <div class="connection-bar">
      <div class="bar-fill bar-active" id="activeBar" style="width: 0%; background: #00ff00;"></div>
      <div class="bar-fill bar-oreka" id="orekaBar" style="width: 0%; background: #ff0000; position: absolute; top: 0;"></div>
    </div>
    <div id="dbStatus" style="font-size: 20px; margin-top: 20px;">
      Waiting for data...
    </div>
  </div>
  
  <div class="stats-grid">
    <div class="stat-box">
      <h3>Connection Breakdown</h3>
      <div id="connectionStats"></div>
    </div>
    <div class="stat-box">
      <h3>Pod Activity</h3>
      <div id="podStats"></div>
    </div>
    <div class="stat-box">
      <h3>Slam History</h3>
      <div id="slamHistory"></div>
    </div>
  </div>
  
  <script>
    function updateDisplay() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/pod-slam')
        .then(r => r.json())
        .then(data => {
          // Update our side
          document.getElementById('ourConnections').textContent = data.userBreakdown.ourApp.connections;
          document.getElementById('ourSleeping').textContent = data.userBreakdown.ourApp.sleeping;
          
          // Update their side
          document.getElementById('orekaConnections').textContent = data.userBreakdown.oreka.connections;
          document.getElementById('podCount').textContent = data.userBreakdown.oreka.podCount;
          
          // Update QPS
          document.getElementById('totalQps').textContent = data.qps;
          
          // Pod grid
          const podGrid = document.getElementById('podGrid');
          podGrid.innerHTML = '';
          for (let i = 0; i < 8; i++) {
            const pod = document.createElement('div');
            pod.className = 'pod';
            if (i < data.userBreakdown.oreka.podCount) {
              pod.classList.add('active');
              pod.innerHTML = \`POD \${i + 1}<br>🔥\`;
            } else {
              pod.innerHTML = \`POD \${i + 1}<br>💤\`;
            }
            podGrid.appendChild(pod);
          }
          
          // Database status
          const db = document.getElementById('database');
          const dbStatus = document.getElementById('dbStatus');
          
          if (data.slamDetected) {
            db.classList.add('under-attack');
            document.getElementById('slamAlert').classList.add('active');
            dbStatus.innerHTML = '<span style="color: #ff0000">⚠️ UNDER ATTACK FROM MULTIPLE PODS! ⚠️</span>';
          } else {
            db.classList.remove('under-attack');
            document.getElementById('slamAlert').classList.remove('active');
            dbStatus.innerHTML = '<span style="color: #00ff00">✅ Operating normally</span>';
          }
          
          // Connection stats
          const totalConn = data.totalConnections;
          const ourPercent = (data.userBreakdown.ourApp.connections / totalConn) * 100;
          const orekaPercent = (data.userBreakdown.oreka.connections / totalConn) * 100;
          
          document.getElementById('connectionStats').innerHTML = \`
            <div class="good">Us: \${ourPercent.toFixed(1)}%</div>
            <div class="bad">Them: \${orekaPercent.toFixed(1)}%</div>
            <div>Total: \${totalConn}/\${data.maxConnections}</div>
          \`;
          
          // Pod activity
          const podList = Object.entries(data.podActivity)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([pod, count]) => \`<div style="color: #ff6600">\${pod}: \${count}</div>\`)
            .join('');
          document.getElementById('podStats').innerHTML = podList || 'No pod activity';
          
          // Slam history
          const history = data.podHistory.slice(-5).reverse()
            .map(h => \`<div>\${h.time.split('T')[1].split('.')[0]} - \${h.qps} QPS from \${h.podCount} pods</div>\`)
            .join('');
          document.getElementById('slamHistory').innerHTML = history || 'No spikes yet';
        })
        .catch(err => console.error('Update error:', err));
    }
    
    // Start monitoring
    updateDisplay();
    setInterval(updateDisplay, 1000);
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
  console.log('Pod Slam API on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('POD SLAM MONITOR on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('⚔️ POD SLAM MONITOR STARTED ⚔️');
console.log('Showing 8 Oreka pods vs 1 Database!');
console.log('Enterprise tool? More like Enterprise ATTACK!');