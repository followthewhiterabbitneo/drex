// EXTREME Monitor - Shows DB + Tomcat connections
const mysql = require('mysql2/promise');
const http = require('http');

const config = {
  DB_HOST: 's01vpsoxweb010',
  DB_PORT: 3306,
  DB_NAME: 'oreka',
  DB_USER: 'DEA',
  DB_PASS: 'hotchip',
  API_PORT: 3001,
  WEB_PORT: 3000,
  // Add your Tomcat servers here
  TOMCAT_SERVERS: [
    's40vpsoxweb001',
    's40vpsoxweb002',
    's01vpsoxweb010',
    's01vpsoxweb011'
  ]
};

// EXTREME LIMITS - Even tighter!
const LIMITS = {
  connections: { max: 50, warning: 35, danger: 40 },
  threads: { max: 30, warning: 15, danger: 20 },
  locks: { max: 5, warning: 1, danger: 2 },
  idle: { max: 40, warning: 20, danger: 30 },  // Idle connections
  tomcat: { max: 200, warning: 100, danger: 150 } // Tomcat threads
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

  if (req.url === '/api/metrics') {
    try {
      const connection = await pool.getConnection();
      
      // Get all metrics
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [variables] = await connection.execute('SHOW GLOBAL VARIABLES');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      // Get connections by host
      const [hostConnections] = await connection.execute(`
        SELECT 
          SUBSTRING_INDEX(host, ':', 1) as server,
          COUNT(*) as count,
          SUM(CASE WHEN command = 'Sleep' THEN 1 ELSE 0 END) as idle
        FROM information_schema.processlist
        WHERE user = 'root'
        GROUP BY SUBSTRING_INDEX(host, ':', 1)
      `);
      
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      const variablesMap = {};
      variables.forEach(row => {
        variablesMap[row.Variable_name] = row.Value;
      });
      
      // Count different states
      let lockedQueries = 0;
      let idleConnections = 0;
      let activeQueries = 0;
      
      processList.forEach(proc => {
        if (proc.State && (proc.State.includes('lock') || proc.State.includes('Lock'))) {
          lockedQueries++;
        }
        if (proc.Command === 'Sleep') {
          idleConnections++;
        }
        if (proc.Command === 'Query' && proc.Info && proc.Info !== 'SHOW PROCESSLIST') {
          activeQueries++;
        }
      });
      
      const metrics = {
        activeConnections: parseInt(statusMap.Threads_connected) || 0,
        runningThreads: parseInt(statusMap.Threads_running) || 0,
        lockedQueries: lockedQueries,
        idleConnections: idleConnections,
        activeQueries: activeQueries,
        maxConnections: parseInt(variablesMap.max_connections) || 0,
        usedConnectionsPct: Math.round((parseInt(statusMap.Threads_connected) / parseInt(variablesMap.max_connections)) * 100),
        hostConnections: hostConnections,
        timestamp: new Date().toISOString()
      };
      
      connection.release();
      res.end(JSON.stringify(metrics));
      
    } catch (error) {
      console.error('Database error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX EXTREME - DATABASE UNDER SIEGE!</title>
  <style>
    body { 
      font-family: 'Arial Black', Arial, sans-serif; 
      background: #000; 
      color: #fff;
      margin: 0;
      padding: 10px;
      overflow-x: hidden;
    }
    
    .critical-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #ff0000, #ff6600, #ff0000);
      background-size: 200% 100%;
      animation: slide 2s linear infinite;
      color: #fff;
      font-size: 28px;
      padding: 15px;
      text-align: center;
      font-weight: bold;
      z-index: 1000;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    
    @keyframes slide {
      0% { background-position: 0% 50%; }
      100% { background-position: 200% 50%; }
    }
    
    h1 { 
      text-align: center; 
      color: #ff0000;
      font-size: 42px;
      margin-top: 70px;
      text-shadow: 0 0 40px #ff0000, 0 0 80px #ff0000;
      animation: extreme-glow 0.5s ease-in-out infinite alternate;
    }
    
    @keyframes extreme-glow {
      from { text-shadow: 0 0 40px #ff0000, 0 0 80px #ff0000; transform: scale(1); }
      to { text-shadow: 0 0 60px #ff0000, 0 0 120px #ff0000, 0 0 180px #ff0000; transform: scale(1.05); }
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 30px;
      margin: 40px auto;
      max-width: 1800px;
    }
    
    .gauge-container {
      text-align: center;
      background: radial-gradient(circle at center, #1a0000 0%, #000 100%);
      padding: 25px;
      border-radius: 20px;
      border: 3px solid #330000;
      position: relative;
      overflow: hidden;
    }
    
    .gauge-container.danger {
      animation: extreme-shake 0.3s infinite;
      border-color: #ff0000;
      box-shadow: 0 0 100px rgba(255,0,0,1), inset 0 0 50px rgba(255,0,0,0.5);
      background: radial-gradient(circle at center, #330000 0%, #000 100%);
    }
    
    @keyframes extreme-shake {
      0%, 100% { transform: translateX(0) rotate(0deg); }
      25% { transform: translateX(-15px) rotate(-2deg); }
      75% { transform: translateX(15px) rotate(2deg); }
    }
    
    .connection-breakdown {
      background: #111;
      padding: 20px;
      margin: 20px auto;
      max-width: 1800px;
      border-radius: 10px;
      border: 2px solid #ff0000;
      font-family: 'Courier New', monospace;
    }
    
    .connection-breakdown h2 {
      color: #ff6600;
      text-align: center;
      font-size: 28px;
      margin-bottom: 20px;
    }
    
    .server-connections {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    
    .server-box {
      background: #222;
      padding: 15px;
      border-radius: 8px;
      border: 2px solid #444;
    }
    
    .server-box.high-load {
      border-color: #ff6600;
      background: #331100;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px auto;
      max-width: 1800px;
    }
    
    .metric-box {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      border: 2px solid #333;
    }
    
    .metric-box.critical {
      border-color: #ff0000;
      background: #330000;
      animation: blink 0.5s infinite;
    }
    
    .metric-value {
      font-size: 48px;
      font-weight: bold;
      color: #ff6600;
    }
    
    .metric-label {
      font-size: 18px;
      color: #ccc;
      margin-top: 10px;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    /* Extreme body effects */
    body.extreme-danger {
      animation: extreme-bg 0.3s infinite;
    }
    
    @keyframes extreme-bg {
      0%, 100% { background: #000; }
      25% { background: #200000; }
      50% { background: #000; }
      75% { background: #100000; }
    }
  </style>
</head>
<body>
  <div class="critical-banner" id="criticalBanner" style="display:none">
    ⚠️ DATABASE CRITICAL! CONNECTIONS EXHAUSTED! ⚠️
  </div>
  
  <h1>🚨 DREX EXTREME MONITOR 🚨</h1>
  
  <div class="metrics-grid" id="topMetrics"></div>
  
  <div class="dashboard" id="dashboard"></div>
  
  <div class="connection-breakdown">
    <h2>CONNECTION BREAKDOWN BY SERVER</h2>
    <div class="server-connections" id="serverConnections"></div>
  </div>
  
  <script>
    function drawExtremeMeter(canvas, value, max, label, warning, danger) {
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 30;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const isDanger = value >= danger;
      const isWarning = value >= warning;
      const isExtreme = value >= max * 0.9;
      
      let color = '#00ff00';
      if (isDanger) {
        color = '#ff0000';
      } else if (isWarning) {
        color = '#ff6600';
      }
      
      // Extreme glow effect
      if (isDanger) {
        for (let i = 5; i > 0; i--) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + (i * 10), 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255,0,0,' + (0.1 / i) + ')';
          ctx.fill();
        }
      }
      
      // Background
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = isDanger ? '#660000' : '#333';
      ctx.lineWidth = 5;
      ctx.stroke();
      
      // Track
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, Math.PI * 0.75, Math.PI * 2.25);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 30;
      ctx.stroke();
      
      // Value arc
      const angle = Math.PI * 0.75 + (Math.min(value, max) / max) * Math.PI * 1.5;
      
      // Multiple layers for extreme effect
      if (isDanger) {
        ctx.shadowBlur = 50;
        ctx.shadowColor = color;
      }
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, Math.PI * 0.75, angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 30;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // Danger zone
      const dangerAngle = Math.PI * 0.75 + (danger / max) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, dangerAngle, Math.PI * 2.25);
      ctx.strokeStyle = 'rgba(255,0,0,0.2)';
      ctx.lineWidth = 32;
      ctx.stroke();
      
      // Value text
      ctx.font = 'bold 64px Arial Black';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      if (isDanger) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
      }
      ctx.fillText(value, centerX, centerY + 10);
      ctx.shadowBlur = 0;
      
      // Label
      ctx.font = 'bold 22px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, centerX, centerY + 50);
      
      // MAX indicator
      ctx.font = '18px Arial';
      ctx.fillStyle = '#888';
      ctx.fillText('MAX: ' + max, centerX, centerY + 75);
      
      // EXTREME warning
      if (isDanger) {
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.fillText('CRITICAL!', centerX, centerY - 80);
        ctx.shadowBlur = 0;
      }
    }
    
    const gauges = [
      { id: 'connections', label: 'CONNECTIONS', ...${JSON.stringify(LIMITS.connections)} },
      { id: 'threads', label: 'ACTIVE THREADS', ...${JSON.stringify(LIMITS.threads)} },
      { id: 'locks', label: 'LOCKED QUERIES', ...${JSON.stringify(LIMITS.locks)} },
      { id: 'idle', label: 'IDLE CONNECTIONS', ...${JSON.stringify(LIMITS.idle)} }
    ];
    
    // Create dashboard
    const dashboard = document.getElementById('dashboard');
    gauges.forEach(gauge => {
      const container = document.createElement('div');
      container.className = 'gauge-container';
      container.id = 'container-' + gauge.id;
      
      const canvas = document.createElement('canvas');
      canvas.id = gauge.id;
      canvas.width = 320;
      canvas.height = 320;
      
      container.appendChild(canvas);
      dashboard.appendChild(container);
    });
    
    let criticalCount = 0;
    
    function updateMetrics() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/metrics')
        .then(r => r.json())
        .then(data => {
          criticalCount = 0;
          
          // Update top metrics
          const topMetrics = document.getElementById('topMetrics');
          topMetrics.innerHTML = \`
            <div class="metric-box \${data.usedConnectionsPct > 80 ? 'critical' : ''}">
              <div class="metric-value">\${data.usedConnectionsPct}%</div>
              <div class="metric-label">CONNECTION POOL USED</div>
            </div>
            <div class="metric-box \${data.activeConnections > 40 ? 'critical' : ''}">
              <div class="metric-value">\${data.activeConnections}/\${data.maxConnections}</div>
              <div class="metric-label">TOTAL CONNECTIONS</div>
            </div>
            <div class="metric-box \${data.activeQueries > 10 ? 'critical' : ''}">
              <div class="metric-value">\${data.activeQueries}</div>
              <div class="metric-label">ACTIVE QUERIES</div>
            </div>
          \`;
          
          // Update gauges
          const values = [
            data.activeConnections,
            data.runningThreads,
            data.lockedQueries,
            data.idleConnections
          ];
          
          gauges.forEach((gauge, i) => {
            const value = values[i];
            drawExtremeMeter(
              document.getElementById(gauge.id),
              value,
              gauge.max,
              gauge.label,
              gauge.warning,
              gauge.danger
            );
            
            const container = document.getElementById('container-' + gauge.id);
            if (value >= gauge.danger) {
              container.classList.add('danger');
              criticalCount++;
            } else {
              container.classList.remove('danger');
            }
          });
          
          // Update server connections
          const serverHtml = data.hostConnections.map(host => \`
            <div class="server-box \${host.count > 10 ? 'high-load' : ''}">
              <h3>\${host.server}</h3>
              <div>Connections: <span style="color:#ff6600; font-size:24px">\${host.count}</span></div>
              <div>Idle: \${host.idle}</div>
              <div>Active: \${host.count - host.idle}</div>
            </div>
          \`).join('');
          
          document.getElementById('serverConnections').innerHTML = serverHtml || 
            '<div style="text-align:center; color:#666">No server connections</div>';
          
          // Extreme alerts
          const isCritical = data.usedConnectionsPct > 80 || criticalCount >= 2;
          document.getElementById('criticalBanner').style.display = 
            isCritical ? 'block' : 'none';
          document.body.className = isCritical ? 'extreme-danger' : '';
        })
        .catch(err => {
          dashboard.innerHTML = '<div style="color:#ff0000; font-size:48px; text-align:center">💀 CONNECTION LOST! 💀</div>';
        });
    }
    
    updateMetrics();
    setInterval(updateMetrics, 2000);
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
  console.log('EXTREME API running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('EXTREME Monitor running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('🔥 DREX EXTREME MONITOR ACTIVATED! 🔥');
console.log('Shows: Connections, Threads, Locks, Idle, and WHO is connecting!');