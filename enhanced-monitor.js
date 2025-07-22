// Enhanced DREX Monitor - Shows ALL the stats with visual correlations!
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

// Store history for multiple metrics
const HISTORY_SIZE = 300; // 5 minutes
const metrics = {
  queries: new Array(HISTORY_SIZE).fill(0),
  sleeping: new Array(HISTORY_SIZE).fill(0),
  active: new Array(HISTORY_SIZE).fill(0),
  locks: new Array(HISTORY_SIZE).fill(0),
  slowQueries: new Array(HISTORY_SIZE).fill(0),
  tmpTables: new Array(HISTORY_SIZE).fill(0),
  bufferPoolFree: new Array(HISTORY_SIZE).fill(0),
  abortedConnects: new Array(HISTORY_SIZE).fill(0),
  threadPoolQueued: new Array(HISTORY_SIZE).fill(0),
  userBreakdown: {}
};

let historyIndex = 0;
let lastValues = {};
let spikeEvents = [];

const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASS,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Sample ALL THE THINGS every second
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    
    // Get all status variables
    const [status] = await connection.execute('SHOW GLOBAL STATUS');
    const statusMap = {};
    status.forEach(row => {
      statusMap[row.Variable_name] = parseInt(row.Value) || 0;
    });
    
    // Get process list details
    const [processList] = await connection.execute('SHOW PROCESSLIST');
    
    // Analyze by user
    const userStats = {};
    let sleepingCount = 0;
    let activeCount = 0;
    let lockCount = 0;
    
    processList.forEach(proc => {
      const user = proc.User || 'unknown';
      if (!userStats[user]) {
        userStats[user] = { total: 0, sleeping: 0, active: 0, locked: 0 };
      }
      userStats[user].total++;
      
      if (proc.Command === 'Sleep') {
        userStats[user].sleeping++;
        sleepingCount++;
      } else if (proc.Command === 'Query') {
        userStats[user].active++;
        activeCount++;
      }
      
      if (proc.State && proc.State.includes('lock')) {
        userStats[user].locked++;
        lockCount++;
      }
    });
    
    // Calculate rates
    const currentTime = Date.now();
    const timeDiff = lastValues.time ? (currentTime - lastValues.time) / 1000 : 1;
    
    const qps = lastValues.Questions ? 
      Math.round((statusMap.Questions - lastValues.Questions) / timeDiff) : 0;
    
    const slowQps = lastValues.Slow_queries ? 
      Math.round((statusMap.Slow_queries - lastValues.Slow_queries) / timeDiff) : 0;
    
    const tmpTablesRate = lastValues.Created_tmp_disk_tables ? 
      Math.round((statusMap.Created_tmp_disk_tables - lastValues.Created_tmp_disk_tables) / timeDiff) : 0;
    
    // Buffer pool usage
    const bufferPoolUsed = statusMap.Innodb_buffer_pool_pages_total > 0 ?
      Math.round((1 - statusMap.Innodb_buffer_pool_pages_free / statusMap.Innodb_buffer_pool_pages_total) * 100) : 0;
    
    // Update history
    metrics.queries[historyIndex] = qps;
    metrics.sleeping[historyIndex] = sleepingCount;
    metrics.active[historyIndex] = activeCount;
    metrics.locks[historyIndex] = lockCount;
    metrics.slowQueries[historyIndex] = slowQps;
    metrics.tmpTables[historyIndex] = tmpTablesRate;
    metrics.bufferPoolFree[historyIndex] = bufferPoolUsed;
    metrics.abortedConnects[historyIndex] = statusMap.Aborted_connects || 0;
    metrics.threadPoolQueued[historyIndex] = statusMap.Threadpool_queued_requests || 0;
    metrics.userBreakdown = userStats;
    
    // Detect spike events
    if (qps > 1000 && (!lastValues.Questions || qps > lastValues.qps * 3)) {
      spikeEvents.push({
        time: new Date().toISOString(),
        qps: qps,
        sleeping: sleepingCount,
        active: activeCount,
        users: Object.keys(userStats).map(u => `${u}:${userStats[u].total}`)
      });
      if (spikeEvents.length > 10) spikeEvents.shift();
    }
    
    // Store for next iteration
    lastValues = {
      ...statusMap,
      time: currentTime,
      qps: qps
    };
    
    historyIndex = (historyIndex + 1) % HISTORY_SIZE;
    connection.release();
    
  } catch (err) {
    console.error('Sampling error:', err);
  }
}, 1000);

// API Server
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/enhanced-stats') {
    try {
      const connection = await pool.getConnection();
      
      // Get thread pool info if available
      const [threadPoolStatus] = await connection.execute(
        "SHOW STATUS LIKE '%thread_pool%'"
      );
      
      const threadPoolInfo = {};
      threadPoolStatus.forEach(row => {
        threadPoolInfo[row.Variable_name] = row.Value;
      });
      
      // Get long running queries
      const [longQueries] = await connection.execute(
        `SELECT USER, HOST, TIME, STATE, LEFT(INFO, 100) as QUERY 
         FROM information_schema.PROCESSLIST 
         WHERE TIME > 5 AND COMMAND != 'Sleep' 
         ORDER BY TIME DESC LIMIT 5`
      );
      
      const response = {
        current: {
          qps: metrics.queries[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          sleeping: metrics.sleeping[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          active: metrics.active[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          locks: metrics.locks[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          slowQueries: metrics.slowQueries[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          bufferPoolUsed: metrics.bufferPoolFree[(historyIndex - 1 + HISTORY_SIZE) % HISTORY_SIZE],
          threadPoolQueued: threadPoolInfo.Threadpool_queued_requests || 0,
          threadPoolThreads: threadPoolInfo.Threadpool_threads || 0,
          threadPoolIdle: threadPoolInfo.Threadpool_idle_threads || 0
        },
        history: {
          queries: [...metrics.queries.slice(historyIndex), ...metrics.queries.slice(0, historyIndex)],
          sleeping: [...metrics.sleeping.slice(historyIndex), ...metrics.sleeping.slice(0, historyIndex)],
          active: [...metrics.active.slice(historyIndex), ...metrics.active.slice(0, historyIndex)],
          locks: [...metrics.locks.slice(historyIndex), ...metrics.locks.slice(0, historyIndex)],
          slowQueries: [...metrics.slowQueries.slice(historyIndex), ...metrics.slowQueries.slice(0, historyIndex)],
          bufferPoolFree: [...metrics.bufferPoolFree.slice(historyIndex), ...metrics.bufferPoolFree.slice(0, historyIndex)]
        },
        userBreakdown: metrics.userBreakdown,
        spikeEvents: spikeEvents,
        longRunningQueries: longQueries,
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

// Web Server with AMAZING visuals
const webServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>DREX Enhanced Monitor - Database Detective Dashboard</title>
  <style>
    body { 
      font-family: 'Courier New', monospace; 
      background: #000; 
      color: #0f0;
      margin: 0;
      padding: 10px;
      overflow-y: auto;
    }
    
    h1 { 
      text-align: center; 
      color: #0f0;
      font-size: 28px;
      margin: 10px 0;
      text-shadow: 0 0 20px #0f0;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 15px;
      max-width: 1800px;
      margin: 0 auto;
    }
    
    .monitor-box {
      background: #111;
      border: 2px solid #0f0;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 0 20px rgba(0,255,0,0.3);
    }
    
    .monitor-title {
      color: #0f0;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      text-shadow: 0 0 10px #0f0;
    }
    
    .big-number {
      font-size: 64px;
      color: #0f0;
      font-weight: bold;
      text-align: center;
      text-shadow: 0 0 30px #0f0;
      margin: 20px 0;
    }
    
    .warning { color: #ff6600; }
    .danger { color: #ff0000; animation: blink 0.5s infinite; }
    .info { color: #00ffff; }
    
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    canvas {
      width: 100%;
      height: 150px;
      border: 1px solid #0f0;
      margin: 10px 0;
    }
    
    .user-breakdown {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin: 10px 0;
    }
    
    .user-stat {
      background: #222;
      border: 1px solid #0f0;
      padding: 10px;
      border-radius: 5px;
    }
    
    .user-stat .username {
      color: #00ffff;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .spike-log {
      background: #220000;
      border: 2px solid #ff0000;
      padding: 10px;
      margin: 10px 0;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .spike-event {
      color: #ff6600;
      margin: 5px 0;
      padding: 5px;
      background: #330000;
      border-left: 3px solid #ff0000;
    }
    
    .correlation-matrix {
      background: #111;
      border: 2px solid #0f0;
      padding: 15px;
      margin: 20px 0;
    }
    
    .thread-pool-gauge {
      display: flex;
      justify-content: space-around;
      align-items: center;
      margin: 20px 0;
    }
    
    .gauge {
      text-align: center;
    }
    
    .gauge-ring {
      width: 120px;
      height: 120px;
      border: 10px solid #333;
      border-radius: 50%;
      position: relative;
      margin: 0 auto;
    }
    
    .gauge-fill {
      position: absolute;
      top: -10px;
      left: -10px;
      width: 120px;
      height: 120px;
      border: 10px solid #0f0;
      border-radius: 50%;
      border-bottom-color: transparent;
      border-right-color: transparent;
      transform: rotate(45deg);
      transition: transform 0.5s;
    }
    
    .gauge-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 24px;
      font-weight: bold;
    }
    
    .long-queries {
      background: #220022;
      border: 1px solid #ff00ff;
      padding: 10px;
      margin: 10px 0;
      font-size: 12px;
      overflow-x: auto;
    }
    
    .sleep-alert {
      background: #442200;
      border: 2px solid #ff6600;
      padding: 20px;
      text-align: center;
      font-size: 24px;
      margin: 20px 0;
      display: none;
    }
    
    .sleep-alert.active {
      display: block;
      animation: shake 0.5s infinite;
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
  </style>
</head>
<body>
  <h1>🔍 DREX ENHANCED - DATABASE DETECTIVE DASHBOARD 🔍</h1>
  
  <div class="sleep-alert" id="sleepAlert">
    ⚠️ HIGH SLEEP CONNECTION COUNT DETECTED! ⚠️
  </div>
  
  <div class="dashboard">
    <div class="monitor-box">
      <div class="monitor-title">🚀 QUERIES PER SECOND</div>
      <div class="big-number" id="qpsValue">0</div>
      <canvas id="qpsChart"></canvas>
    </div>
    
    <div class="monitor-box">
      <div class="monitor-title">😴 SLEEPING CONNECTIONS</div>
      <div class="big-number" id="sleepValue">0</div>
      <canvas id="sleepChart"></canvas>
      <div id="sleepWarning" style="text-align: center; color: #ff6600;"></div>
    </div>
    
    <div class="monitor-box">
      <div class="monitor-title">⚡ ACTIVE QUERIES</div>
      <div class="big-number" id="activeValue">0</div>
      <canvas id="activeChart"></canvas>
    </div>
    
    <div class="monitor-box">
      <div class="monitor-title">🔒 LOCK WAITS</div>
      <div class="big-number" id="lockValue">0</div>
      <canvas id="lockChart"></canvas>
    </div>
  </div>
  
  <div class="monitor-box">
    <div class="monitor-title">👥 USER BREAKDOWN - WHO'S HOGGING THE DB?</div>
    <div id="userBreakdown" class="user-breakdown"></div>
  </div>
  
  <div class="monitor-box">
    <div class="monitor-title">🧵 THREAD POOL STATUS</div>
    <div class="thread-pool-gauge">
      <div class="gauge">
        <div class="gauge-ring">
          <div class="gauge-fill" id="threadPoolGauge"></div>
          <div class="gauge-value" id="threadPoolValue">0</div>
        </div>
        <div>Total Threads</div>
      </div>
      <div class="gauge">
        <div class="gauge-ring">
          <div class="gauge-fill" id="idleGauge"></div>
          <div class="gauge-value" id="idleValue">0</div>
        </div>
        <div>Idle Threads</div>
      </div>
      <div class="gauge">
        <div class="gauge-ring">
          <div class="gauge-fill" id="queuedGauge"></div>
          <div class="gauge-value" id="queuedValue">0</div>
        </div>
        <div>Queued Requests</div>
      </div>
    </div>
  </div>
  
  <div class="correlation-matrix">
    <div class="monitor-title">📊 CORRELATION ANALYSIS</div>
    <canvas id="correlationChart" style="height: 300px;"></canvas>
    <div id="correlationInsights" style="margin-top: 10px;"></div>
  </div>
  
  <div class="monitor-box spike-log">
    <div class="monitor-title">🚨 SPIKE EVENT LOG</div>
    <div id="spikeLog"></div>
  </div>
  
  <div class="monitor-box long-queries">
    <div class="monitor-title">🐌 LONG RUNNING QUERIES</div>
    <div id="longQueries"></div>
  </div>
  
  <script>
    // Chart drawing functions
    function drawLineChart(canvas, data, color, max) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      // Grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Data line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      
      ctx.beginPath();
      const step = width / data.length;
      data.forEach((value, i) => {
        const x = i * step;
        const y = height - (value / max) * height * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    
    function drawCorrelation(canvas, data) {
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      // Draw multiple metrics overlaid
      const metrics = [
        { data: data.queries, color: '#00ff00', label: 'Queries' },
        { data: data.sleeping, color: '#ff6600', label: 'Sleeping' },
        { data: data.active, color: '#00ffff', label: 'Active' }
      ];
      
      // Normalize and draw
      metrics.forEach((metric, idx) => {
        const max = Math.max(...metric.data);
        ctx.strokeStyle = metric.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        
        ctx.beginPath();
        const step = width / metric.data.length;
        metric.data.forEach((value, i) => {
          const x = i * step;
          const y = height - (value / max) * height * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Label
        ctx.fillStyle = metric.color;
        ctx.fillText(metric.label, 10, 20 + idx * 20);
      });
      
      ctx.globalAlpha = 1;
    }
    
    let lastSleepCount = 0;
    
    function updateDashboard() {
      fetch('http://' + window.location.hostname + ':${config.API_PORT}/api/enhanced-stats')
        .then(r => r.json())
        .then(data => {
          // Update big numbers
          document.getElementById('qpsValue').textContent = data.current.qps;
          document.getElementById('sleepValue').textContent = data.current.sleeping;
          document.getElementById('activeValue').textContent = data.current.active;
          document.getElementById('lockValue').textContent = data.current.locks;
          
          // Color code based on thresholds
          if (data.current.qps > 3000) {
            document.getElementById('qpsValue').className = 'big-number danger';
          } else if (data.current.qps > 1000) {
            document.getElementById('qpsValue').className = 'big-number warning';
          } else {
            document.getElementById('qpsValue').className = 'big-number';
          }
          
          // Sleep connection alert
          if (data.current.sleeping > 50) {
            document.getElementById('sleepAlert').classList.add('active');
            document.getElementById('sleepWarning').textContent = 
              'Call Analytics is hoarding connections!';
          } else {
            document.getElementById('sleepAlert').classList.remove('active');
            document.getElementById('sleepWarning').textContent = '';
          }
          
          // Draw charts
          const canvases = ['qpsChart', 'sleepChart', 'activeChart', 'lockChart'];
          canvases.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas.width !== canvas.offsetWidth) {
              canvas.width = canvas.offsetWidth;
              canvas.height = canvas.offsetHeight;
            }
          });
          
          drawLineChart(document.getElementById('qpsChart'), data.history.queries, '#00ff00', 5000);
          drawLineChart(document.getElementById('sleepChart'), data.history.sleeping, '#ff6600', 100);
          drawLineChart(document.getElementById('activeChart'), data.history.active, '#00ffff', 50);
          drawLineChart(document.getElementById('lockChart'), data.history.locks, '#ff0000', 20);
          
          // User breakdown
          const userHtml = Object.entries(data.userBreakdown)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([user, stats]) => \`
              <div class="user-stat">
                <div class="username">\${user}</div>
                <div>Total: \${stats.total}</div>
                <div style="color: #ff6600">Sleep: \${stats.sleeping}</div>
                <div style="color: #00ffff">Active: \${stats.active}</div>
                <div style="color: #ff0000">Locked: \${stats.locked}</div>
              </div>
            \`).join('');
          document.getElementById('userBreakdown').innerHTML = userHtml;
          
          // Thread pool gauges
          document.getElementById('threadPoolValue').textContent = data.current.threadPoolThreads;
          document.getElementById('idleValue').textContent = data.current.threadPoolIdle;
          document.getElementById('queuedValue').textContent = data.current.threadPoolQueued;
          
          // Spike events
          const spikeHtml = data.spikeEvents.map(event => \`
            <div class="spike-event">
              <strong>\${event.time}</strong><br>
              QPS: \${event.qps} | Sleep: \${event.sleeping} | Active: \${event.active}<br>
              Users: \${event.users.join(', ')}
            </div>
          \`).join('');
          document.getElementById('spikeLog').innerHTML = spikeHtml || '<div style="color: #666">No spikes detected yet...</div>';
          
          // Long queries
          const longHtml = data.longRunningQueries.map(q => \`
            <div style="margin: 10px 0; padding: 5px; background: #330033;">
              <strong>\${q.USER}@\${q.HOST}</strong> - \${q.TIME}s<br>
              State: \${q.STATE || 'Running'}<br>
              Query: \${q.QUERY || 'N/A'}
            </div>
          \`).join('');
          document.getElementById('longQueries').innerHTML = longHtml || '<div style="color: #666">No long queries</div>';
          
          // Correlation chart
          const corrCanvas = document.getElementById('correlationChart');
          if (corrCanvas.width !== corrCanvas.offsetWidth) {
            corrCanvas.width = corrCanvas.offsetWidth;
            corrCanvas.height = corrCanvas.offsetHeight;
          }
          drawCorrelation(corrCanvas, data.history);
          
          // Correlation insights
          const sleepSpike = data.current.sleeping > lastSleepCount * 1.5;
          const insights = [];
          
          if (data.current.sleeping > 50 && data.current.qps < 100) {
            insights.push('🔍 High sleep count with low activity - connection pooling issue!');
          }
          if (sleepSpike && data.current.qps > 1000) {
            insights.push('📈 Sleep connections spike correlates with query surge!');
          }
          if (data.current.locks > 5) {
            insights.push('🔒 Lock contention detected - check for blocking queries!');
          }
          if (data.current.threadPoolQueued > 10) {
            insights.push('🧵 Thread pool saturated - requests backing up!');
          }
          
          document.getElementById('correlationInsights').innerHTML = 
            insights.join('<br>') || '<div style="color: #666">Monitoring for patterns...</div>';
          
          lastSleepCount = data.current.sleeping;
        })
        .catch(err => console.error('Update error:', err));
    }
    
    // Start monitoring
    updateDashboard();
    setInterval(updateDashboard, 1000);
    
    // Fun animation for the header
    setInterval(() => {
      const emojis = ['🔍', '🕵️', '🔎', '🕵️‍♀️'];
      const h1 = document.querySelector('h1');
      const current = h1.textContent;
      const newEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      h1.textContent = current.replace(/🔍|🕵️|🔎|🕵️‍♀️/g, newEmoji);
    }, 3000);
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
  console.log('Enhanced API running on port ' + config.API_PORT);
});

webServer.listen(config.WEB_PORT, '0.0.0.0', () => {
  console.log('Enhanced Monitor running on port ' + config.WEB_PORT);
  console.log('Dashboard: http://s01vpsromuls001:' + config.WEB_PORT);
});

console.log('🔍 DREX ENHANCED MONITOR STARTED 🔍');
console.log('Tracking EVERYTHING - Sleep connections, thread pools, and more!');
console.log('Making the database abuse UNDENIABLE and FUN!');