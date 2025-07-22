#!/bin/bash
# Simple start script that bypasses TypeScript build

echo "🚀 Starting DREX without TypeScript build..."

cd /moneyball/drex

# Check Node version
echo "📊 Node version:"
node --version

# Create a simple start script that doesn't need build
cat > start-simple.js << 'EOF'
const { spawn } = require('child_process');

console.log('Starting DREX services...');

// Start API server
const api = spawn('node', ['src/api/monitor.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

// Start preview server (serve dist files)
const preview = spawn('npx', ['serve', 'dist', '-l', '3000'], {
  stdio: 'inherit',
  env: { ...process.env }
});

// Handle exits
process.on('SIGINT', () => {
  api.kill();
  preview.kill();
  process.exit();
});
EOF

# Install serve if not installed
echo "📦 Installing serve..."
npm install -g serve

# Create a minimal dist folder with the UI
echo "🎨 Creating minimal UI..."
mkdir -p dist
cp index.html dist/
cp -r src dist/
cp -r public/* dist/ 2>/dev/null || true

# Update systemd service to use simple start
echo "🔧 Updating service..."
sudo tee /etc/systemd/system/drex.service << EOF
[Unit]
Description=DREX MariaDB Monitor
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/moneyball/drex
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node start-simple.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Reload and restart
echo "🔄 Restarting service..."
sudo systemctl daemon-reload
sudo systemctl restart drex

echo "
✅ Started with simple runner!

Check status: sudo systemctl status drex
Check API: curl http://localhost:3001/api/metrics
View logs: sudo journalctl -u drex -f

If this works, the dashboard will be at http://s01vpsromuls001:3000
"