// Legacy MariaDB monitor for Node.js v10
const mysql = require('mysql2/promise');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load config from .env file
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
      
      // Get metrics
      const [status] = await connection.execute('SHOW GLOBAL STATUS');
      const [variables] = await connection.execute('SHOW GLOBAL VARIABLES');
      const [processList] = await connection.execute('SHOW PROCESSLIST');
      
      // Convert to maps
      const statusMap = {};
      status.forEach(row => {
        statusMap[row.Variable_name] = row.Value;
      });
      
      const variablesMap = {};
      variables.forEach(row => {
        variablesMap[row.Variable_name] = row.Value;
      });
      
      // Count locks
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
  } else if (req.url === '/api/locks') {
    try {
      const connection = await pool.getConnection();
      const [processList] = await connection.execute('SHOW FULL PROCESSLIST');
      
      const locks = processList
        .filter(proc => proc.State && proc.State.includes('lock'))
        .map(proc => ({
          id: proc.Id,
          user: proc.User,
          host: proc.Host,
          db: proc.db,
          time: proc.Time,
          state: proc.State,
          info: proc.Info ? proc.Info.substring(0, 100) + '...' : ''
        }));
      
      connection.release();
      res.end(JSON.stringify(locks));
      
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

// Web Server
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
      background: #1a1a1a; 
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    h1 { text-align: center; color: #4CAF50; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    .metric {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      border: 2px solid #333;
    }
    .metric.danger { border-color: #f44336; background: rgba(244,67,54,0.1); }
    .metric.warning { border-color: #ff9800; background: rgba(255,152,0,0.1); }
    .metric h3 { margin: 0 0 10px 0; }
    .metric .value { font-size: 3em; font-weight: bold; }
    .locks {
      background: #2a2a2a;
      padding: 20px;
      border-radius: 8px;
      margin-top: 20px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #444; }
    th { background: #333; }
    .error { color: #f44336; text-align: center; padding: 20px; }
  </style>
</head>
<body>
  <h1>DREX - MariaDB Monitor</h1>
  <h2 style="text-align:center">Host: ${config.DB_HOST} | Database: ${config.DB_NAME}</h2>
  
  <div id="metrics" class="metrics">Loading...</div>
  <div id="locks" class="locks" style="display:none"></div>
  
  <script>
    function fetchMetrics() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/metrics')
        .then(r => r.json())
        .then(data => {
          const html = [
            {
              label: 'Active Connections',
              value: data.activeConnections,
              max: 100,
              warning: 60,
              danger: 80
            },
            {
              label: 'Running Threads',
              value: data.runningThreads,
              max: 50,
              warning: 30,
              danger: 40
            },
            {
              label: 'Locked Queries',
              value: data.lockedQueries,
              max: 20,
              warning: 5,
              danger: 10
            },
            {
              label: 'Queries/sec',
              value: data.queriesPerSecond,
              max: 300,
              warning: 200,
              danger: 250
            }
          ].map(m => {
            const status = m.value >= m.danger ? 'danger' : m.value >= m.warning ? 'warning' : '';
            return '<div class="metric ' + status + '">' +
              '<h3>' + m.label + '</h3>' +
              '<div class="value">' + m.value + '</div>' +
              '<div>Max: ' + m.max + '</div>' +
            '</div>';
          }).join('');
          
          document.getElementById('metrics').innerHTML = html;
          
          // Update page style if redlining
          if (data.lockedQueries > 10 || data.activeConnections > 80) {
            document.body.style.animation = 'pulse 2s infinite';
          } else {
            document.body.style.animation = '';
          }
        })
        .catch(err => {
          document.getElementById('metrics').innerHTML = 
            '<div class="error">Error: ' + err.message + '</div>';
        });
      
      // Fetch locks
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/locks')
        .then(r => r.json())
        .then(locks => {
          if (locks.length > 0) {
            const html = '<h2>Active Locks (' + locks.length + ')</h2>' +
              '<table><tr><th>ID</th><th>User</th><th>Time</th><th>State</th><th>Query</th></tr>' +
              locks.map(l => 
                '<tr><td>' + l.id + '</td><td>' + l.user + '</td><td>' + 
                l.time + '</td><td>' + l.state + '</td><td>' + l.info + '</td></tr>'
              ).join('') + '</table>';
            document.getElementById('locks').innerHTML = html;
            document.getElementById('locks').style.display = 'block';
          } else {
            document.getElementById('locks').style.display = 'none';
          }
        });
    }
    
    // CSS animation
    var style = document.createElement('style');
    style.textContent = '@keyframes pulse { 0%,100% { background-color: #1a1a1a; } 50% { background-color: rgba(244,67,54,0.2); } }';
    document.head.appendChild(style);
    
    // Fetch every 3 seconds
    fetchMetrics();
    setInterval(fetchMetrics, 3000);
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
apiServer.listen(config.API_PORT, () => {
  console.log('API server running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, () => {
  console.log('Web server running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://localhost:' + config.WEB_PORT);
});

console.log('DREX Legacy Monitor started!');
console.log('Monitoring: ' + config.DB_USER + '@' + config.DB_HOST + ':' + config.DB_PORT + '/' + config.DB_NAME);