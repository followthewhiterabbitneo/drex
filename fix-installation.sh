#!/bin/bash
# Quick fix for DREX installation on s01vpsromuls001

echo "🔧 Fixing DREX installation..."

# Fix package.json
echo "📝 Fixing package.json..."
cd /moneyball/drex

# Backup current package.json
cp package.json package.json.backup

# Fix the JSON syntax
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = {
  ...pkg.scripts,
  'dev': 'concurrently \"npm run api\" \"vite\"',
  'api': 'node src/api/monitor.js', 
  'build': 'tsc -b && vite build',
  'preview': 'vite preview',
  'start': 'concurrently \"npm run api\" \"npm run preview\"'
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Fixed package.json');
"

# Build the app
echo "🏗️ Building DREX..."
npm run build

# Restart the service
echo "🔄 Restarting DREX service..."
sudo systemctl restart drex

# Check status
echo "📊 Checking DREX status..."
sudo systemctl status drex

echo "
✅ Fix complete!

Try accessing:
- Dashboard: http://s01vpsromuls001:3000
- API: http://s01vpsromuls001:3001/api/metrics

To check logs: sudo journalctl -u drex -f
"