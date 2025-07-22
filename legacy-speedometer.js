// Legacy MariaDB monitor with circular speedometers for Node.js v10
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
      let activeQueries = 0;
      processList.forEach(proc => {
        if (proc.State && proc.State.includes('lock')) {
          lockedQueries++;
        }
        if (proc.Command === 'Query') {
          activeQueries++;
        }
      });
      
      const metrics = {
        activeConnections: parseInt(statusMap.Threads_connected) || 0,
        runningThreads: parseInt(statusMap.Threads_running) || 0,
        deniedAttempts: parseInt(statusMap.Aborted_connects) || 0,
        queriesPerSecond: Math.round(parseInt(statusMap.Questions) / parseInt(statusMap.Uptime)) || 0,
        lockedQueries: lockedQueries,
        activeQueries: activeQueries,
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

// Web Server with Speedometers
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX - MariaDB Monitor</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      background: #0a0a0a; 
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    h1 { 
      text-align: center; 
      color: #00ff00;
      text-shadow: 0 0 20px #00ff00;
      animation: glow 2s ease-in-out infinite;
    }
    @keyframes glow {
      0%, 100% { text-shadow: 0 0 20px #00ff00; }
      50% { text-shadow: 0 0 40px #00ff00, 0 0 60px #00ff00; }
    }
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin: 40px auto;
      max-width: 1400px;
    }
    .gauge-container {
      text-align: center;
      background: #1a1a1a;
      padding: 20px;
      border-radius: 15px;
      box-shadow: 0 0 30px rgba(0,255,0,0.3);
    }
    .gauge-container.danger {
      animation: danger-pulse 1s infinite;
      box-shadow: 0 0 50px rgba(255,0,0,0.8);
    }
    @keyframes danger-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    canvas { 
      max-width: 100%; 
      height: auto;
    }
    .error { 
      color: #ff0000; 
      text-align: center; 
      padding: 20px;
      font-size: 24px;
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .status {
      text-align: center;
      margin-top: 20px;
      font-size: 18px;
      color: #00ff00;
    }
    h2 {
      text-align: center;
      color: #ffff00;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>DREX - DATABASE REAL-TIME EXAMINER</h1>
  <h2>Monitoring: ${config.DB_HOST} | Database: ${config.DB_NAME}</h2>
  
  <div id="dashboard" class="dashboard"></div>
  <div id="status" class="status"></div>
  
  <script>
    // Speedometer drawing function
    function drawSpeedometer(canvas, value, max, label, warning, danger) {
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 20;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Determine color based on value
      let color = '#00ff00'; // green
      if (value >= danger) {
        color = '#ff0000'; // red
      } else if (value >= warning) {
        color = '#ffaa00'; // orange
      }
      
      // Draw outer ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Draw colored arc background
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, Math.PI * 0.75, Math.PI * 2.25);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 20;
      ctx.stroke();
      
      // Draw colored arc
      const angle = Math.PI * 0.75 + (value / max) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, Math.PI * 0.75, angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Draw glow effect
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, Math.PI * 0.75, angle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 22;
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // Draw ticks
      for (let i = 0; i <= 10; i++) {
        const tickAngle = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
        const x1 = centerX + Math.cos(tickAngle) * (radius - 30);
        const y1 = centerY + Math.sin(tickAngle) * (radius - 30);
        const x2 = centerX + Math.cos(tickAngle) * (radius - 40);
        const y2 = centerY + Math.sin(tickAngle) * (radius - 40);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Draw needle
      const needleAngle = Math.PI * 0.75 + (value / max) * Math.PI * 1.5;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(needleAngle);
      
      // Needle shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(radius - 40, 2);
      ctx.lineTo(radius - 40, -2);
      ctx.lineTo(0, -5);
      ctx.closePath();
      ctx.fill();
      
      // Needle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.lineTo(radius - 45, 1);
      ctx.lineTo(radius - 45, -1);
      ctx.lineTo(0, -3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      
      // Center dot
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Value text
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(value, centerX, centerY + 10);
      
      // Label
      ctx.font = '18px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, centerX, centerY + 40);
      
      // Max value
      ctx.font = '14px Arial';
      ctx.fillStyle = '#666';
      ctx.fillText('Max: ' + max, centerX, centerY + 60);
    }
    
    // Gauge definitions
    const gauges = [
      { id: 'connections', label: 'Active Connections', max: 100, warning: 60, danger: 80 },
      { id: 'threads', label: 'Running Threads', max: 50, warning: 30, danger: 40 },
      { id: 'locks', label: 'Locked Queries', max: 20, warning: 5, danger: 10 },
      { id: 'qps', label: 'Queries/Second', max: 300, warning: 200, danger: 250 }
    ];
    
    // Create canvases
    const dashboard = document.getElementById('dashboard');
    gauges.forEach(gauge => {
      const container = document.createElement('div');
      container.className = 'gauge-container';
      container.id = 'container-' + gauge.id;
      
      const canvas = document.createElement('canvas');
      canvas.id = gauge.id;
      canvas.width = 300;
      canvas.height = 300;
      
      container.appendChild(canvas);
      dashboard.appendChild(container);
    });
    
    // Update function
    function updateMetrics() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/metrics')
        .then(r => r.json())
        .then(data => {
          // Update gauges
          drawSpeedometer(
            document.getElementById('connections'), 
            data.activeConnections, 
            gauges[0].max, gauges[0].label, gauges[0].warning, gauges[0].danger
          );
          
          drawSpeedometer(
            document.getElementById('threads'), 
            data.runningThreads, 
            gauges[1].max, gauges[1].label, gauges[1].warning, gauges[1].danger
          );
          
          drawSpeedometer(
            document.getElementById('locks'), 
            data.lockedQueries, 
            gauges[2].max, gauges[2].label, gauges[2].warning, gauges[2].danger
          );
          
          drawSpeedometer(
            document.getElementById('qps'), 
            data.queriesPerSecond, 
            gauges[3].max, gauges[3].label, gauges[3].warning, gauges[3].danger
          );
          
          // Add danger class to containers
          gauges.forEach(gauge => {
            const container = document.getElementById('container-' + gauge.id);
            const value = gauge.id === 'connections' ? data.activeConnections :
                         gauge.id === 'threads' ? data.runningThreads :
                         gauge.id === 'locks' ? data.lockedQueries :
                         data.queriesPerSecond;
            
            if (value >= gauge.danger) {
              container.classList.add('danger');
            } else {
              container.classList.remove('danger');
            }
          });
          
          // Update status
          document.getElementById('status').innerHTML = 
            'Last Update: ' + new Date().toLocaleTimeString() + 
            ' | Locks: ' + data.lockedQueries + 
            ' | Connections: ' + data.activeConnections;
          
          // Flash background if critical
          if (data.lockedQueries > 10 || data.activeConnections > 80) {
            document.body.style.animation = 'danger-pulse 2s infinite';
            document.body.style.backgroundColor = '#200000';
          } else {
            document.body.style.animation = '';
            document.body.style.backgroundColor = '#0a0a0a';
          }
        })
        .catch(err => {
          dashboard.innerHTML = '<div class="error">CONNECTION LOST: ' + err.message + '</div>';
        });
    }
    
    // Start updates
    updateMetrics();
    setInterval(updateMetrics, 3000);
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
  console.log('API server running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('Web server running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('DREX Speedometer Monitor started!');
console.log('Monitoring: ' + config.DB_USER + '@' + config.DB_HOST + ':' + config.DB_PORT + '/' + config.DB_NAME);