// EVIDENCE COLLECTOR - Tracks all Oreka pod activity for the "backup" reveal
const mysql = require('mysql2/promise');
const fs = require('fs');
const http = require('http');

const config = {
  DB_HOST: 's01vpsoxweb010',
  DB_PORT: 3306,
  DB_NAME: 'oreka',
  DB_USER: 'DEA',
  DB_PASS: 'hotchip',
  API_PORT: 3002,
  WEB_PORT: 3003
};

// Evidence storage
const evidence = {
  podIPs: new Set(),
  spikeEvents: [],
  queryPatterns: {},
  connectionHistory: [],
  maxPodsSeen: 0,
  totalSpikes: 0,
  startTime: new Date()
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

// Collect evidence every second
setInterval(async () => {
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
    
    // Analyze Oreka connections
    const currentPods = new Set();
    const orekaActivity = {};
    
    processList.forEach(proc => {
      // Identify Oreka/Analytics connections
      if (proc.User && (
          proc.User.toLowerCase().includes('oreka') || 
          proc.User.toLowerCase().includes('analytics') ||
          proc.User.toLowerCase().includes('call') ||
          proc.User === 'app' || // Common app user
          proc.User === 'service' // Service accounts
      )) {
        if (proc.Host) {
          const ip = proc.Host.split(':')[0];
          currentPods.add(ip);
          evidence.podIPs.add(ip);
          
          orekaActivity[ip] = {
            connections: (orekaActivity[ip]?.connections || 0) + 1,
            queries: proc.Command === 'Query' ? (orekaActivity[ip]?.queries || 0) + 1 : (orekaActivity[ip]?.queries || 0),
            sleeping: proc.Command === 'Sleep' ? (orekaActivity[ip]?.sleeping || 0) + 1 : (orekaActivity[ip]?.sleeping || 0)
          };
          
          // Capture query patterns
          if (proc.Info && proc.Command === 'Query') {
            const queryKey = proc.Info.substring(0, 50);
            evidence.queryPatterns[queryKey] = (evidence.queryPatterns[queryKey] || 0) + 1;
          }
        }
      }
    });
    
    // Update max pods seen
    evidence.maxPodsSeen = Math.max(evidence.maxPodsSeen, currentPods.size);
    
    // Detect spike event
    if (qps > 1000 && currentPods.size >= 3) {
      evidence.totalSpikes++;
      evidence.spikeEvents.push({
        timestamp: new Date().toISOString(),
        qps: qps,
        podCount: currentPods.size,
        pods: Array.from(currentPods),
        podActivity: orekaActivity
      });
      
      // Keep only last 100 spike events
      if (evidence.spikeEvents.length > 100) {
        evidence.spikeEvents.shift();
      }
    }
    
    // Record connection history
    evidence.connectionHistory.push({
      time: new Date().toISOString(),
      qps: qps,
      totalConnections: parseInt(statusMap.Threads_connected) || 0,
      orekaPods: currentPods.size,
      podDetails: orekaActivity
    });
    
    // Keep only last 300 entries (5 minutes)
    if (evidence.connectionHistory.length > 300) {
      evidence.connectionHistory.shift();
    }
    
    connection.release();
    
  } catch (err) {
    console.error('Evidence collection error:', err);
  }
}, 1000);

// Save evidence to file every minute
setInterval(() => {
  const report = {
    summary: {
      collectionStarted: evidence.startTime,
      totalPodsIdentified: evidence.podIPs.size,
      maxConcurrentPods: evidence.maxPodsSeen,
      totalSpikesDetected: evidence.totalSpikes,
      averageSpikesPerHour: Math.round(evidence.totalSpikes / ((Date.now() - evidence.startTime) / 3600000))
    },
    podList: Array.from(evidence.podIPs),
    recentSpikes: evidence.spikeEvents.slice(-10),
    topQueryPatterns: Object.entries(evidence.queryPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
  };
  
  fs.writeFileSync('oreka-evidence.json', JSON.stringify(report, null, 2));
}, 60000);

// API Server
const apiServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/evidence') {
    res.end(JSON.stringify({
      summary: {
        collectionStarted: evidence.startTime,
        runningTime: Math.round((Date.now() - evidence.startTime) / 1000),
        totalPodsIdentified: evidence.podIPs.size,
        maxConcurrentPods: evidence.maxPodsSeen,
        totalSpikesDetected: evidence.totalSpikes,
        currentPods: evidence.connectionHistory[evidence.connectionHistory.length - 1]?.orekaPods || 0
      },
      podList: Array.from(evidence.podIPs),
      lastSpike: evidence.spikeEvents[evidence.spikeEvents.length - 1] || null,
      recentHistory: evidence.connectionHistory.slice(-60)
    }));
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

apiServer.listen(config.API_PORT, '0.0.0.0', () => {
  console.log('Evidence API running on port ' + config.API_PORT);
});

console.log('🕵️ EVIDENCE COLLECTOR STARTED 🕵️');
console.log('Silently tracking all Oreka pod activity...');
console.log('Evidence file: oreka-evidence.json');
console.log('API endpoint: http://localhost:' + config.API_PORT + '/api/evidence');