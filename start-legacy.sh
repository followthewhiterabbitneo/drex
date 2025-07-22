#!/bin/bash
# Start script for Node.js v10

echo "🚀 Starting DREX Legacy Monitor for Node.js v10..."

cd /moneyball/drex

# Kill any existing node processes on our ports
echo "🔧 Cleaning up old processes..."
sudo pkill -f "node.*monitor.js" || true
sudo pkill -f "node.*3001" || true
sudo lsof -ti:3000 | xargs sudo kill -9 2>/dev/null || true
sudo lsof -ti:3001 | xargs sudo kill -9 2>/dev/null || true

# Start the legacy monitor
echo "📊 Starting legacy monitor..."
nohup node legacy-monitor.js > drex.log 2>&1 &

# Wait a moment
sleep 2

# Check if it's running
if ps aux | grep -v grep | grep "legacy-monitor.js" > /dev/null; then
    echo "
✅ DREX Legacy Monitor is running!

📊 Dashboard: http://s01vpsromuls001:3000
🔌 API: http://s01vpsromuls001:3001/api/metrics

📝 Monitoring:
- Database: oreka on s01vpsoxweb010
- Using: DEA@s01vpsoxweb010:3306

🛠️ Commands:
- View logs: tail -f drex.log
- Stop: pkill -f legacy-monitor.js
- Check API: curl http://localhost:3001/api/metrics
"
else
    echo "❌ Failed to start! Check drex.log for errors"
    tail -20 drex.log
fi