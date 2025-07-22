#!/bin/bash
# DREX Turnkey Installation Script for s01vpsromuls001
# MariaDB Monitor for massive lock issues on Oreka database

echo "🚀 DREX Installation Starting..."

# Configuration
INSTALL_DIR="/moneyball/drex"
DREX_PORT=3000
DB_HOST="s01vpsoxweb010"
DB_PORT="3306"
DB_NAME="oreka"
DB_USER="DEA"
DB_PASS="hotchip"

# Step 1: Clone repository
echo "📦 Cloning DREX repository..."
cd /moneyball
if [ -d "drex" ]; then
    echo "DREX directory exists, pulling latest..."
    cd drex
    git pull
else
    git clone https://github.com/followthewhiterabbitneo/drex.git
    cd drex
fi

# Step 2: Install dependencies
echo "📚 Installing dependencies..."
npm install

# Step 3: Create src/api directory
echo "📁 Creating API directory..."
mkdir -p src/api

# Step 4: Create API backend for MariaDB monitoring
echo "🔧 Creating MariaDB monitoring backend..."
cat > src/api/monitor.js << 'EOF'
const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MariaDB connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Monitor endpoint
app.get('/api/metrics', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        // Get key metrics
        const [status] = await connection.execute('SHOW GLOBAL STATUS');
        const [variables] = await connection.execute('SHOW GLOBAL VARIABLES');
        const [processList] = await connection.execute('SHOW PROCESSLIST');
        
        // Extract metrics
        const statusMap = {};
        status.forEach(row => {
            statusMap[row.Variable_name] = row.Value;
        });
        
        const variablesMap = {};
        variables.forEach(row => {
            variablesMap[row.Variable_name] = row.Value;
        });
        
        // Count locks and active queries
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
            queriesPerSecond: parseInt(statusMap.Questions) / parseInt(statusMap.Uptime) || 0,
            lockedQueries: lockedQueries,
            activeQueries: activeQueries,
            maxConnections: parseInt(variablesMap.max_connections) || 0,
            uptime: parseInt(statusMap.Uptime) || 0
        };
        
        connection.release();
        res.json(metrics);
        
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// Lock details endpoint
app.get('/api/locks', async (req, res) => {
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
                command: proc.Command,
                time: proc.Time,
                state: proc.State,
                info: proc.Info
            }));
        
        connection.release();
        res.json(locks);
        
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch lock details' });
    }
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
    console.log(\`DREX API running on port \${PORT}\`);
});
EOF

# Step 5: Update package.json with new dependencies
echo "📝 Updating package.json..."
npm install express cors mysql2 dotenv concurrently

# Update package.json scripts
cat > package.json.tmp << 'EOF'
{
  "name": "drex",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run api\" \"vite\"",
    "api": "node src/api/monitor.js",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "start": "concurrently \"npm run api\" \"npm run preview\""
  },
EOF
tail -n +11 package.json >> package.json.tmp
mv package.json.tmp package.json

# Step 6: Create environment configuration
echo "🔐 Creating environment configuration..."
cat > .env << EOF
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
API_PORT=3001
VITE_API_URL=http://localhost:3001
EOF

# Step 7: Update frontend to use real API
echo "🎨 Updating frontend to use real API..."
cat > src/app.tsx << 'EOF'
import { useState, useEffect } from 'preact/hooks'
import './app.css'
import { Speedometer } from './components/Speedometer'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function App() {
  const [metrics, setMetrics] = useState({
    activeConnections: 0,
    runningThreads: 0,
    deniedAttempts: 0,
    queriesPerSecond: 0,
    lockedQueries: 0,
    activeQueries: 0
  });

  const [locks, setLocks] = useState([]);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`${API_URL}/api/metrics`);
        const data = await response.json();
        setMetrics(data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    };

    const fetchLocks = async () => {
      try {
        const response = await fetch(`${API_URL}/api/locks`);
        const data = await response.json();
        setLocks(data);
      } catch (error) {
        console.error('Failed to fetch locks:', error);
      }
    };

    fetchMetrics();
    fetchLocks();
    const interval = setInterval(() => {
      fetchMetrics();
      fetchLocks();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <h1>DREX - MariaDB Monitor (Oreka)</h1>
      <h2>Host: ${DB_HOST} | Database: ${DB_NAME}</h2>
      
      <div class="dashboard">
        <div class="gauge-container">
          <h3>Active Connections</h3>
          <Speedometer value={metrics.activeConnections} max={100} warning={60} danger={80} />
        </div>
        
        <div class="gauge-container">
          <h3>Running Threads</h3>
          <Speedometer value={metrics.runningThreads} max={50} warning={30} danger={40} />
        </div>
        
        <div class="gauge-container">
          <h3>Locked Queries</h3>
          <Speedometer value={metrics.lockedQueries} max={20} warning={5} danger={10} />
        </div>
        
        <div class="gauge-container">
          <h3>Queries per Second</h3>
          <Speedometer value={Math.round(metrics.queriesPerSecond)} max={300} warning={200} danger={250} />
        </div>
      </div>

      {locks.length > 0 && (
        <div class="locks-section">
          <h2>🔒 Active Locks ({locks.length})</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Time (s)</th>
                <th>State</th>
                <th>Query</th>
              </tr>
            </thead>
            <tbody>
              {locks.map(lock => (
                <tr key={lock.id}>
                  <td>{lock.id}</td>
                  <td>{lock.user}</td>
                  <td>{lock.time}</td>
                  <td>{lock.state}</td>
                  <td>{lock.info?.substring(0, 100)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
EOF

# Step 8: Add lock monitoring styles
echo "🎨 Adding lock monitoring styles..."
cat >> src/app.css << 'EOF'

.locks-section {
  margin-top: 2rem;
  padding: 1rem;
  background: #1a1a1a;
  border-radius: 8px;
}

.locks-section h2 {
  color: #ff6b6b;
  margin-bottom: 1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #333;
}

th {
  background: #2a2a2a;
  font-weight: bold;
}

tr:hover {
  background: #2a2a2a;
}
EOF

# Step 9: Build the application
echo "🏗️ Building DREX..."
npm run build

# Step 10: Create systemd service
echo "🚀 Creating systemd service..."
sudo tee /etc/systemd/system/drex.service << EOF
[Unit]
Description=DREX MariaDB Monitor
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Step 11: Start the service
echo "✅ Starting DREX service..."
sudo systemctl daemon-reload
sudo systemctl enable drex
sudo systemctl start drex

echo "
🎉 DREX Installation Complete!

📊 Dashboard URL: http://s01vpsromuls001:${DREX_PORT}
🔌 API URL: http://s01vpsromuls001:3001

📝 Monitoring:
- Database: ${DB_NAME} on ${DB_HOST}
- Replicas: s01vpsoxseb011, s40vpsoxweb002
- Focus: Lock monitoring for in-house app issues

🛠️ Commands:
- Check status: sudo systemctl status drex
- View logs: sudo journalctl -u drex -f
- Restart: sudo systemctl restart drex
- Stop: sudo systemctl stop drex

🔥 The dashboard will show:
- Active connections and threads
- Lock information in real-time
- Queries causing locks
- Performance bottlenecks

Good luck troubleshooting those massive lock issues! 🚀
"