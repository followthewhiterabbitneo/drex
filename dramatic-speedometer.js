// DRAMATIC MariaDB monitor - designed to redline frequently!
const mysql = require('mysql2/promise');
const http = require('http');

// Configuration
const config = {
  DB_HOST: 's01vpsoxweb010',
  DB_PORT: 3306,
  DB_NAME: 'oreka',
  DB_USER: 'DEA',
  DB_PASS: 'hotchip',
  API_PORT: 3001,
  WEB_PORT: 3000
};

// DRAMATIC LIMITS - Set low to ensure frequent redlining!
const DRAMATIC_LIMITS = {
  connections: { max: 50, warning: 35, danger: 40 },    // Will redline at 40 connections
  threads: { max: 30, warning: 20, danger: 25 },        // Will redline at 25 threads
  locks: { max: 5, warning: 1, danger: 2 },             // Will redline at just 2 locks!
  qps: { max: 100, warning: 50, danger: 75 }            // Will redline at 75 qps
};

// Create MySQL connection pool
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
      
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [variables] = await connection.execute('SHOW GLOBAL VARIABLES');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      let lockedQueries = 0;
      let waitingQueries = 0;
      processList.forEach(proc => {
        if (proc.State && (proc.State.includes('lock') || proc.State.includes('Lock'))) {
          lockedQueries++;
        }
        if (proc.State && proc.State.includes('wait')) {
          waitingQueries++;
        }
      });
      
      const metrics = {
        activeConnections: parseInt(statusMap.Threads_connected) || 0,
        runningThreads: parseInt(statusMap.Threads_running) || 0,
        lockedQueries: lockedQueries + waitingQueries,
        queriesPerSecond: Math.round(parseInt(statusMap.Questions) / parseInt(statusMap.Uptime)) || 0,
        slowQueries: parseInt(statusMap.Slow_queries) || 0,
        tableLockWaits: parseInt(statusMap.Table_locks_waited) || 0,
        maxUsedConnections: parseInt(statusMap.Max_used_connections) || 0,
        timestamp: new Date().toISOString()
      };
      
      connection.release();
      res.end(JSON.stringify(metrics));
      
    } catch (error) {
      console.error('Database error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Database error: ' + error.message }));
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

// Web Server with DRAMATIC Speedometers
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX - DRAMATIC DATABASE MONITOR</title>
  <style>
    body { 
      font-family: 'Arial Black', Arial, sans-serif; 
      background: #000; 
      color: #fff;
      margin: 0;
      padding: 20px;
      overflow-x: hidden;
    }
    
    /* Dramatic title */
    h1 { 
      text-align: center; 
      color: #ff0000;
      font-size: 48px;
      text-transform: uppercase;
      letter-spacing: 8px;
      text-shadow: 0 0 30px #ff0000, 0 0 60px #ff0000, 0 0 90px #ff0000;
      animation: dramatic-glow 1s ease-in-out infinite alternate;
      margin: 20px 0;
    }
    
    @keyframes dramatic-glow {
      from { text-shadow: 0 0 30px #ff0000, 0 0 60px #ff0000, 0 0 90px #ff0000; }
      to { text-shadow: 0 0 40px #ff0000, 0 0 80px #ff0000, 0 0 120px #ff0000, 0 0 150px #ff0000; }
    }
    
    /* Redline warning banner */
    .redline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ff0000;
      color: #fff;
      font-size: 32px;
      padding: 20px;
      text-align: center;
      font-weight: bold;
      animation: flash 0.5s infinite;
      z-index: 1000;
      display: none;
    }
    
    .redline-banner.active {
      display: block;
    }
    
    @keyframes flash {
      0%, 100% { opacity: 1; background: #ff0000; }
      50% { opacity: 0.8; background: #aa0000; }
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 40px;
      margin: 60px auto;
      max-width: 1600px;
    }
    
    .gauge-container {
      text-align: center;
      background: radial-gradient(circle at center, #1a0000 0%, #000 100%);
      padding: 30px;
      border-radius: 20px;
      border: 3px solid #330000;
      box-shadow: 0 0 50px rgba(255,0,0,0.2);
      transition: all 0.3s;
    }
    
    .gauge-container.warning {
      animation: warning-pulse 2s infinite;
      border-color: #ff6600;
      box-shadow: 0 0 80px rgba(255,102,0,0.6);
    }
    
    .gauge-container.danger {
      animation: danger-shake 0.5s infinite;
      border-color: #ff0000;
      box-shadow: 0 0 120px rgba(255,0,0,0.9), inset 0 0 50px rgba(255,0,0,0.3);
    }
    
    @keyframes warning-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    @keyframes danger-shake {
      0%, 100% { transform: translateX(0) scale(1); }
      25% { transform: translateX(-10px) scale(1.02); }
      75% { transform: translateX(10px) scale(1.02); }
    }
    
    canvas { 
      max-width: 100%; 
      height: auto;
    }
    
    .stats {
      background: #111;
      padding: 20px;
      margin: 20px auto;
      max-width: 1600px;
      border-radius: 10px;
      border: 2px solid #ff0000;
      font-family: 'Courier New', monospace;
      font-size: 18px;
      box-shadow: 0 0 30px rgba(255,0,0,0.3);
    }
    
    .critical-info {
      color: #ff0000;
      font-weight: bold;
      font-size: 24px;
      animation: blink 1s infinite;
    }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    /* Dramatic background effects */
    body.redlining {
      animation: redline-bg 0.5s infinite;
    }
    
    @keyframes redline-bg {
      0%, 100% { background: #000; }
      50% { background: #200000; }
    }
    
    /* Lightning effect for extreme conditions */
    .lightning {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 999;
    }
    
    .lightning.active {
      animation: lightning-flash 2s;
    }
    
    @keyframes lightning-flash {
      0%, 100% { background: transparent; }
      10% { background: rgba(255,255,255,0.9); }
      11% { background: transparent; }
      20% { background: rgba(255,255,255,0.6); }
      21% { background: transparent; }
    }
  </style>
</head>
<body>
  <div class="redline-banner" id="redlineBanner">
    ⚠️ SYSTEM REDLINING! DATABASE UNDER EXTREME LOAD! ⚠️
  </div>
  
  <div class="lightning" id="lightning"></div>
  
  <h1>DREX EXTREME MONITOR</h1>
  <h2 style="text-align:center; color:#ff6600;">OREKA DATABASE @ ${config.DB_HOST}</h2>
  
  <div id="dashboard" class="dashboard"></div>
  
  <div class="stats" id="stats">
    <div>Peak Connections: <span id="peakConnections">-</span></div>
    <div>Slow Queries: <span id="slowQueries">-</span></div>
    <div>Table Lock Waits: <span id="lockWaits">-</span></div>
    <div class="critical-info" id="criticalInfo"></div>
  </div>
  
  <script>
    // Enhanced speedometer with more dramatic effects
    function drawDramaticSpeedometer(canvas, value, max, label, warning, danger) {
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 30;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Determine state
      const isWarning = value >= warning;
      const isDanger = value >= danger;
      const isExtreme = value >= max * 0.9;
      
      let primaryColor = '#00ff00';
      let glowIntensity = 20;
      
      if (isDanger) {
        primaryColor = '#ff0000';
        glowIntensity = 60;
      } else if (isWarning) {
        primaryColor = '#ff6600';
        glowIntensity = 40;
      }
      
      // Draw dramatic outer glow
      if (isDanger) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 20, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(centerX, centerY, radius - 20, centerX, centerY, radius + 40);
        gradient.addColorStop(0, 'rgba(255,0,0,0)');
        gradient.addColorStop(0.5, 'rgba(255,0,0,0.3)');
        gradient.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      
      // Main gauge circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      // Dramatic background arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, Math.PI * 0.75, Math.PI * 2.25);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 30;
      ctx.stroke();
      
      // Value arc with glow
      const angle = Math.PI * 0.75 + (Math.min(value, max) / max) * Math.PI * 1.5;
      
      // Multiple glow layers for drama
      for (let i = 3; i >= 0; i--) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 15, Math.PI * 0.75, angle);
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 30 + (i * 5);
        ctx.globalAlpha = 0.3 - (i * 0.07);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // Main value arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, Math.PI * 0.75, angle);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 30;
      ctx.lineCap = 'round';
      ctx.shadowBlur = glowIntensity;
      ctx.shadowColor = primaryColor;
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // Danger zone markers
      const dangerAngle = Math.PI * 0.75 + (danger / max) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 15, dangerAngle, Math.PI * 2.25);
      ctx.strokeStyle = 'rgba(255,0,0,0.3)';
      ctx.lineWidth = 32;
      ctx.stroke();
      
      // Tick marks
      for (let i = 0; i <= 10; i++) {
        const tickAngle = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
        const x1 = centerX + Math.cos(tickAngle) * (radius - 35);
        const y1 = centerY + Math.sin(tickAngle) * (radius - 35);
        const x2 = centerX + Math.cos(tickAngle) * (radius - 45);
        const y2 = centerY + Math.sin(tickAngle) * (radius - 45);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i * 10 >= danger * 10 / max ? '#ff0000' : '#666';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      
      // Dramatic needle
      const needleAngle = Math.PI * 0.75 + (Math.min(value, max) / max) * Math.PI * 1.5;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(needleAngle);
      
      // Needle with dramatic styling
      const gradient = ctx.createLinearGradient(0, -5, radius - 50, 0);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(1, isDanger ? '#ffffff' : primaryColor);
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(radius - 50, 1);
      ctx.lineTo(radius - 45, 0);
      ctx.lineTo(radius - 50, -1);
      ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fill();
      
      // Needle glow
      if (isDanger) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = primaryColor;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      
      ctx.restore();
      
      // Center hub
      ctx.beginPath();
      ctx.arc(centerX, centerY, 12, 0, 2 * Math.PI);
      const hubGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 12);
      hubGradient.addColorStop(0, '#fff');
      hubGradient.addColorStop(0.5, primaryColor);
      hubGradient.addColorStop(1, '#000');
      ctx.fillStyle = hubGradient;
      ctx.fill();
      
      // Value display
      ctx.font = 'bold 56px Arial Black';
      ctx.fillStyle = primaryColor;
      ctx.textAlign = 'center';
      ctx.shadowBlur = isDanger ? 30 : 10;
      ctx.shadowColor = primaryColor;
      ctx.fillText(value, centerX, centerY + 10);
      ctx.shadowBlur = 0;
      
      // Label
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, centerX, centerY + 45);
      
      // Limit display
      ctx.font = '16px Arial';
      ctx.fillStyle = '#888';
      ctx.fillText('LIMIT: ' + max, centerX, centerY + 70);
      
      // REDLINE indicator
      if (isDanger) {
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0000';
        ctx.fillText('REDLINE!', centerX, centerY - 80);
        ctx.shadowBlur = 0;
      }
    }
    
    // Gauge configurations with DRAMATIC limits
    const gauges = [
      { id: 'connections', label: 'CONNECTIONS', ...${JSON.stringify(DRAMATIC_LIMITS.connections)} },
      { id: 'threads', label: 'THREADS', ...${JSON.stringify(DRAMATIC_LIMITS.threads)} },
      { id: 'locks', label: 'LOCKS', ...${JSON.stringify(DRAMATIC_LIMITS.locks)} },
      { id: 'qps', label: 'QUERIES/SEC', ...${JSON.stringify(DRAMATIC_LIMITS.qps)} }
    ];
    
    // Create canvases
    const dashboard = document.getElementById('dashboard');
    gauges.forEach(gauge => {
      const container = document.createElement('div');
      container.className = 'gauge-container';
      container.id = 'container-' + gauge.id;
      
      const canvas = document.createElement('canvas');
      canvas.id = gauge.id;
      canvas.width = 350;
      canvas.height = 350;
      
      container.appendChild(canvas);
      dashboard.appendChild(container);
    });
    
    let redlineCount = 0;
    let lastLightning = 0;
    
    // Update function
    function updateMetrics() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/metrics')
        .then(r => r.json())
        .then(data => {
          redlineCount = 0;
          
          // Update gauges
          const values = [
            data.activeConnections,
            data.runningThreads,
            data.lockedQueries,
            data.queriesPerSecond
          ];
          
          gauges.forEach((gauge, i) => {
            const value = values[i];
            drawDramaticSpeedometer(
              document.getElementById(gauge.id),
              value,
              gauge.max,
              gauge.label,
              gauge.warning,
              gauge.danger
            );
            
            // Update container state
            const container = document.getElementById('container-' + gauge.id);
            container.className = 'gauge-container';
            
            if (value >= gauge.danger) {
              container.classList.add('danger');
              redlineCount++;
            } else if (value >= gauge.warning) {
              container.classList.add('warning');
            }
          });
          
          // Update stats
          document.getElementById('peakConnections').textContent = data.maxUsedConnections;
          document.getElementById('slowQueries').textContent = data.slowQueries;
          document.getElementById('lockWaits').textContent = data.tableLockWaits;
          
          // Critical info
          if (redlineCount > 0) {
            document.getElementById('criticalInfo').textContent = 
              '⚠️ ' + redlineCount + ' METRICS IN REDLINE ZONE! ⚠️';
          } else {
            document.getElementById('criticalInfo').textContent = '';
          }
          
          // Dramatic effects
          const isRedlining = redlineCount > 0;
          document.getElementById('redlineBanner').className = 
            isRedlining ? 'redline-banner active' : 'redline-banner';
          document.body.className = isRedlining ? 'redlining' : '';
          
          // Lightning effect for extreme conditions
          if (redlineCount >= 3 && Date.now() - lastLightning > 5000) {
            const lightning = document.getElementById('lightning');
            lightning.className = 'lightning active';
            setTimeout(() => { lightning.className = 'lightning'; }, 2000);
            lastLightning = Date.now();
          }
        })
        .catch(err => {
          dashboard.innerHTML = '<div style="color:#ff0000; font-size:36px; text-align:center">⚠️ CONNECTION LOST! ⚠️</div>';
        });
    }
    
    // Start updates
    updateMetrics();
    setInterval(updateMetrics, 2000); // Faster updates for more drama
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
  console.log('DRAMATIC API server running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('DRAMATIC Web server running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('🚨 DREX DRAMATIC MONITOR ACTIVATED! 🚨');
console.log('Monitoring: ' + config.DB_USER + '@' + config.DB_HOST + ':' + config.DB_PORT + '/' + config.DB_NAME);
console.log('LIMITS SET FOR MAXIMUM DRAMA:');
console.log('- Connections: REDLINE at 40 (currently seeing 38)');
console.log('- Locks: REDLINE at just 2 locks!');
console.log('- Low thresholds = MORE REDLINING!');