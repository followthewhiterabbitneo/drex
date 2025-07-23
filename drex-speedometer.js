// DREX SPEEDOMETER - Database Real-time EXaminer
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

// Speedometer limits
const LIMITS = {
  qps: { max: 5000, warning: 1000, danger: 3000 },
  connections: { max: 100, warning: 50, danger: 80 },
  locks: { max: 20, warning: 5, danger: 10 },
  sleeping: { max: 100, warning: 30, danger: 50 }
};

// Track QPS and high water marks
let lastQuestions = 0;
let lastTime = Date.now();
let highWaterMarks = {
  qps: 0,
  connections: 0,
  locks: 0,
  sleeping: 0,
  orktag: 0
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

// API Server
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/drex-metrics') {
    try {
      const connection = await pool.getConnection();
      
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      // Try to get InnoDB lock info (may not be available on older MariaDB)
      let innodbLocks = 0;
      try {
        const [lockWaits] = await connection.execute(
          'SELECT COUNT(*) as count FROM information_schema.INNODB_LOCK_WAITS'
        );
        if (lockWaits[0]) {
          innodbLocks = parseInt(lockWaits[0].count) || 0;
        }
      } catch (e) {
        // Ignore if table doesn't exist
      }
      
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
      
      // Count sleeping connections, locks, and analyze activity
      let sleepingCount = 0;
      let lockCount = 0;
      let orktagActivity = 0;
      const connectionDetails = {};
      const orekaConnections = {};
      
      processList.forEach(proc => {
        if (proc.Command === 'Sleep') sleepingCount++;
        
        // Enhanced lock detection - catch all lock-related states
        if (proc.State) {
          const state = proc.State.toLowerCase();
          if (state.includes('lock') || 
              state.includes('waiting') ||
              state.includes('locked') ||
              state.includes('metadata') ||
              state.includes('flush')) {
            lockCount++;
          }
        }
        
        // Also check if query is stuck for a long time (potential lock)
        if (proc.Time > 10 && proc.Command === 'Query') {
          lockCount++;
        }
        
        // Track orktag activity
        if (proc.Info && proc.Info.toLowerCase().includes('orktag')) {
          orktagActivity++;
        }
        
        // Track connections by host
        if (proc.Host) {
          const ip = proc.Host.split(':')[0];
          connectionDetails[ip] = (connectionDetails[ip] || 0) + 1;
          
          // Identify Oreka/Analytics connections by user or pattern
          if (proc.User && (proc.User.toLowerCase().includes('oreka') || 
              proc.User.toLowerCase().includes('analytics') ||
              proc.User.toLowerCase().includes('call'))) {
            orekaConnections[ip] = (orekaConnections[ip] || 0) + 1;
          }
        }
      });
      
      // Add InnoDB locks to total
      lockCount += innodbLocks;
      
      // Update high water marks
      highWaterMarks.qps = Math.max(highWaterMarks.qps, qps);
      highWaterMarks.connections = Math.max(highWaterMarks.connections, parseInt(statusMap.Threads_connected) || 0);
      highWaterMarks.locks = Math.max(highWaterMarks.locks, lockCount);
      highWaterMarks.sleeping = Math.max(highWaterMarks.sleeping, sleepingCount);
      highWaterMarks.orktag = Math.max(highWaterMarks.orktag, orktagActivity);
      
      const metrics = {
        qps: { value: qps, ...LIMITS.qps, highWater: highWaterMarks.qps },
        connections: { value: parseInt(statusMap.Threads_connected) || 0, ...LIMITS.connections, highWater: highWaterMarks.connections },
        locks: { value: lockCount, ...LIMITS.locks, highWater: highWaterMarks.locks },
        sleeping: { value: sleepingCount, ...LIMITS.sleeping, highWater: highWaterMarks.sleeping },
        orktag: { value: orktagActivity, max: 20, warning: 5, danger: 10, highWater: highWaterMarks.orktag },
        connectionDetails: connectionDetails,
        orekaConnections: orekaConnections,
        orekaPodCount: Object.keys(orekaConnections).length,
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

// Web Server with Speedometer Display
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX - Database Real-time EXaminer</title>
  <style>
    body { 
      font-family: 'Arial Black', sans-serif; 
      background: #000; 
      color: #fff;
      margin: 0;
      padding: 20px;
      overflow: hidden;
    }
    
    h1 { 
      text-align: center; 
      color: #00ff00;
      font-size: 48px;
      margin: 20px 0;
      text-shadow: 0 0 20px #00ff00;
      letter-spacing: 10px;
    }
    
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 18px;
      margin-bottom: 30px;
      letter-spacing: 3px;
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 30px;
      max-width: 1600px;
      margin: 0 auto;
    }
    
    .speedometer-container {
      background: #111;
      border: 3px solid #333;
      border-radius: 20px;
      padding: 20px;
      text-align: center;
    }
    
    .speedometer {
      position: relative;
      width: 350px;
      height: 200px;
      margin: 0 auto 10px;
    }
    
    .speedometer-face {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 5px solid #333;
      border-radius: 180px 180px 20px 20px;
      background: radial-gradient(ellipse at center bottom, #222 0%, #000 100%);
      overflow: hidden;
    }
    
    .tick {
      position: absolute;
      width: 2px;
      height: 20px;
      background: #666;
      left: 50%;
      bottom: 0;
      transform-origin: center 100px;
    }
    
    .tick.major {
      height: 30px;
      width: 4px;
      background: #fff;
    }
    
    .needle {
      position: absolute;
      width: 4px;
      height: 110px;
      background: #ff0000;
      left: 50%;
      bottom: 0;
      margin-left: -2px;
      transform-origin: center bottom;
      transition: transform 0.5s ease-out;
      box-shadow: 0 0 10px #ff0000;
    }
    
    .needle::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 20px;
      background: #333;
      border-radius: 50%;
      bottom: -10px;
      left: -8px;
    }
    
    .value-display {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 36px;
      font-weight: bold;
      color: #00ff00;
      text-shadow: 0 0 10px #00ff00;
    }
    
    .high-water-mark {
      position: absolute;
      width: 2px;
      height: 110px;
      background: #ffff00;
      left: 50%;
      bottom: 0;
      margin-left: -1px;
      transform-origin: center bottom;
      opacity: 0.7;
      pointer-events: none;
    }
    
    .high-water-label {
      font-size: 14px;
      color: #ffff00;
      margin: 5px 0;
    }
    
    .connection-details {
      font-size: 12px;
      color: #666;
      margin: 10px 0;
      text-align: left;
      padding: 10px;
      background: #111;
      border-radius: 5px;
      max-height: 100px;
      overflow-y: auto;
    }
    
    .connection-ip {
      color: #00ff00;
      margin: 2px 0;
    }
    
    .redline {
      position: absolute;
      width: 100%;
      height: 100%;
      bottom: 0;
      left: 0;
      pointer-events: none;
    }
    
    .redline::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 40px;
      background: rgba(255, 0, 0, 0.3);
      bottom: 0;
      left: 0;
      border-radius: 180px 180px 0 0;
      transform-origin: center 100px;
      transform: rotate(-30deg);
    }
    
    .label {
      font-size: 24px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 10px;
    }
    
    .warning { color: #ff6600 !important; text-shadow: 0 0 10px #ff6600 !important; }
    .danger { color: #ff0000 !important; text-shadow: 0 0 20px #ff0000 !important; animation: pulse 0.5s infinite; }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    .shaking {
      animation: shake 0.5s infinite;
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
    
    .spike-alert {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: #fff;
      padding: 40px;
      font-size: 48px;
      font-weight: bold;
      border-radius: 20px;
      display: none;
      z-index: 1000;
      animation: flash 0.3s infinite;
    }
    
    .spike-alert.active {
      display: block;
    }
    
    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  </style>
</head>
<body>
  <h1>DREX</h1>
  <div class="subtitle">DATABASE REAL-TIME EXAMINER</div>
  
  <div class="spike-alert" id="spikeAlert">
    QUERY SPIKE DETECTED!
  </div>
  
  <div class="dashboard">
    <div class="speedometer-container" id="qpsContainer">
      <div class="label">Queries/Second</div>
      <div class="speedometer">
        <div class="speedometer-face">
          <div class="tick major" style="transform: rotate(-90deg)"></div>
          <div class="tick" style="transform: rotate(-72deg)"></div>
          <div class="tick" style="transform: rotate(-54deg)"></div>
          <div class="tick" style="transform: rotate(-36deg)"></div>
          <div class="tick" style="transform: rotate(-18deg)"></div>
          <div class="tick major" style="transform: rotate(0deg)"></div>
          <div class="tick" style="transform: rotate(18deg)"></div>
          <div class="tick" style="transform: rotate(36deg)"></div>
          <div class="tick" style="transform: rotate(54deg)"></div>
          <div class="tick" style="transform: rotate(72deg)"></div>
          <div class="tick major" style="transform: rotate(90deg)"></div>
          <div class="redline"></div>
          <div class="high-water-mark" id="qpsHighWater"></div>
          <div class="needle" id="qpsNeedle"></div>
          <div class="value-display" id="qpsValue">0</div>
        </div>
        <div class="high-water-label">High: <span id="qpsHigh">0</span></div>
      </div>
      <div class="connection-details" id="qpsDetails"></div>
    </div>
    
    <div class="speedometer-container" id="connContainer">
      <div class="label">Connections</div>
      <div class="speedometer">
        <div class="speedometer-face">
          <div class="tick major" style="transform: rotate(-90deg)"></div>
          <div class="tick" style="transform: rotate(-72deg)"></div>
          <div class="tick" style="transform: rotate(-54deg)"></div>
          <div class="tick" style="transform: rotate(-36deg)"></div>
          <div class="tick" style="transform: rotate(-18deg)"></div>
          <div class="tick major" style="transform: rotate(0deg)"></div>
          <div class="tick" style="transform: rotate(18deg)"></div>
          <div class="tick" style="transform: rotate(36deg)"></div>
          <div class="tick" style="transform: rotate(54deg)"></div>
          <div class="tick" style="transform: rotate(72deg)"></div>
          <div class="tick major" style="transform: rotate(90deg)"></div>
          <div class="redline"></div>
          <div class="high-water-mark" id="connHighWater"></div>
          <div class="needle" id="connNeedle"></div>
          <div class="value-display" id="connValue">0</div>
        </div>
        <div class="high-water-label">High: <span id="connHigh">0</span></div>
      </div>
      <div class="connection-details" id="connDetails"></div>
    </div>
    
    <div class="speedometer-container" id="sleepContainer">
      <div class="label">Sleeping Connections</div>
      <div class="speedometer">
        <div class="speedometer-face">
          <div class="tick major" style="transform: rotate(-90deg)"></div>
          <div class="tick" style="transform: rotate(-72deg)"></div>
          <div class="tick" style="transform: rotate(-54deg)"></div>
          <div class="tick" style="transform: rotate(-36deg)"></div>
          <div class="tick" style="transform: rotate(-18deg)"></div>
          <div class="tick major" style="transform: rotate(0deg)"></div>
          <div class="tick" style="transform: rotate(18deg)"></div>
          <div class="tick" style="transform: rotate(36deg)"></div>
          <div class="tick" style="transform: rotate(54deg)"></div>
          <div class="tick" style="transform: rotate(72deg)"></div>
          <div class="tick major" style="transform: rotate(90deg)"></div>
          <div class="redline"></div>
          <div class="high-water-mark" id="sleepHighWater"></div>
          <div class="needle" id="sleepNeedle"></div>
          <div class="value-display" id="sleepValue">0</div>
        </div>
        <div class="high-water-label">High: <span id="sleepHigh">0</span></div>
      </div>
      <div class="connection-details" id="sleepDetails"></div>
    </div>
    
    <div class="speedometer-container" id="lockContainer">
      <div class="label">Lock Waits</div>
      <div class="speedometer">
        <div class="speedometer-face">
          <div class="tick major" style="transform: rotate(-90deg)"></div>
          <div class="tick" style="transform: rotate(-72deg)"></div>
          <div class="tick" style="transform: rotate(-54deg)"></div>
          <div class="tick" style="transform: rotate(-36deg)"></div>
          <div class="tick" style="transform: rotate(-18deg)"></div>
          <div class="tick major" style="transform: rotate(0deg)"></div>
          <div class="tick" style="transform: rotate(18deg)"></div>
          <div class="tick" style="transform: rotate(36deg)"></div>
          <div class="tick" style="transform: rotate(54deg)"></div>
          <div class="tick" style="transform: rotate(72deg)"></div>
          <div class="tick major" style="transform: rotate(90deg)"></div>
          <div class="redline"></div>
          <div class="high-water-mark" id="lockHighWater"></div>
          <div class="needle" id="lockNeedle"></div>
          <div class="value-display" id="lockValue">0</div>
        </div>
        <div class="high-water-label">High: <span id="lockHigh">0</span></div>
      </div>
      <div class="connection-details" id="lockDetails"></div>
    </div>
    
    <div class="speedometer-container" id="orktagContainer">
      <div class="label">ORKTAG Activity</div>
      <div class="speedometer">
        <div class="speedometer-face">
          <div class="tick major" style="transform: rotate(-90deg)"></div>
          <div class="tick" style="transform: rotate(-72deg)"></div>
          <div class="tick" style="transform: rotate(-54deg)"></div>
          <div class="tick" style="transform: rotate(-36deg)"></div>
          <div class="tick" style="transform: rotate(-18deg)"></div>
          <div class="tick major" style="transform: rotate(0deg)"></div>
          <div class="tick" style="transform: rotate(18deg)"></div>
          <div class="tick" style="transform: rotate(36deg)"></div>
          <div class="tick" style="transform: rotate(54deg)"></div>
          <div class="tick" style="transform: rotate(72deg)"></div>
          <div class="tick major" style="transform: rotate(90deg)"></div>
          <div class="redline"></div>
          <div class="high-water-mark" id="orktagHighWater"></div>
          <div class="needle" id="orktagNeedle"></div>
          <div class="value-display" id="orktagValue">0</div>
        </div>
        <div class="high-water-label">High: <span id="orktagHigh">0</span></div>
      </div>
      <div class="connection-details" id="orktagDetails"></div>
    </div>
  </div>
  
  <script>
    function updateSpeedometer(metric, data) {
      const needle = document.getElementById(metric + 'Needle');
      const valueDisplay = document.getElementById(metric + 'Value');
      const container = document.getElementById(metric + 'Container');
      const highWaterMark = document.getElementById(metric + 'HighWater');
      const highLabel = document.getElementById(metric + 'High');
      
      const value = data.value;
      const max = data.max;
      const angle = Math.min((value / max) * 180 - 90, 90);
      
      needle.style.transform = 'rotate(' + angle + 'deg)';
      valueDisplay.textContent = value;
      
      // Update high water mark
      if (highWaterMark && data.highWater !== undefined) {
        const highAngle = Math.min((data.highWater / max) * 180 - 90, 90);
        highWaterMark.style.transform = 'rotate(' + highAngle + 'deg)';
      }
      if (highLabel) {
        highLabel.textContent = data.highWater || 0;
      }
      
      // Color coding
      valueDisplay.classList.remove('warning', 'danger');
      container.classList.remove('shaking');
      
      if (value >= data.danger) {
        valueDisplay.classList.add('danger');
        container.classList.add('shaking');
      } else if (value >= data.warning) {
        valueDisplay.classList.add('warning');
      }
      
      // Spike alert for QPS
      if (metric === 'qps' && value > 3000) {
        document.getElementById('spikeAlert').classList.add('active');
        setTimeout(() => {
          document.getElementById('spikeAlert').classList.remove('active');
        }, 2000);
      }
    }
    
    function updateConnectionDetails(data) {
      // Update connection details for the main gauges
      if (data.connectionDetails) {
        const topIPs = Object.entries(data.connectionDetails)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([ip, count]) => {
            const isOreka = data.orekaConnections && data.orekaConnections[ip];
            const color = isOreka ? '#ff0000' : '#00ff00';
            const label = isOreka ? ' [OREKA POD]' : '';
            return `<div class="connection-ip" style="color: ${color}">${ip}: ${count} connections${label}</div>`;
          })
          .join('');
        
        const detailsEl = document.getElementById('connDetails');
        if (detailsEl) {
          detailsEl.innerHTML = topIPs || '<div style="color: #333">No active connections</div>';
        }
      }
      
      // Show Oreka pod info
      if (data.orekaConnections && data.orekaPodCount > 0) {
        const orktagDetailsEl = document.getElementById('orktagDetails');
        if (orktagDetailsEl) {
          const podList = Object.entries(data.orekaConnections)
            .map(([ip, count]) => `<div style="color: #ff0000">POD ${ip}: ${count} connections</div>`)
            .join('');
          orktagDetailsEl.innerHTML = `<div style="color: #ff6600; font-weight: bold;">${data.orekaPodCount} OREKA PODS DETECTED!</div>${podList}`;
        }
      }
    }
    
    function update() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/drex-metrics')
        .then(r => r.json())
        .then(data => {
          updateSpeedometer('qps', data.qps);
          updateSpeedometer('conn', data.connections);
          updateSpeedometer('sleep', data.sleeping);
          updateSpeedometer('lock', data.locks);
          if (data.orktag) {
            updateSpeedometer('orktag', data.orktag);
          }
          updateConnectionDetails(data);
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
  console.log('DREX API running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('DREX SPEEDOMETER running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('====================================');
console.log('    D R E X   S P E E D O M E T E R');
console.log('====================================');
console.log('Database Real-time EXaminer Started!');
console.log('Monitoring ' + config.DB_HOST + ':' + config.DB_PORT);