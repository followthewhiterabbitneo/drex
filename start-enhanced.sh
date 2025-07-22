#!/bin/bash
# Start the enhanced DREX monitor with all the stats!

echo "🚀 Starting DREX Enhanced Monitor..."
echo "=================================="
echo "This monitor shows:"
echo "  📊 Query rates and spikes"
echo "  😴 Sleeping connections (from Call Analytics!)"
echo "  ⚡ Active queries"
echo "  🔒 Lock waits"
echo "  🧵 Thread pool status"
echo "  👥 User breakdown - who's hogging the DB"
echo "  📈 Correlation analysis"
echo "  🚨 Real-time spike detection"
echo ""
echo "Dashboard will be available at:"
echo "http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "ekg-monitor.js" 2>/dev/null
pkill -f "enhanced-monitor.js" 2>/dev/null

# Start the enhanced monitor
node enhanced-monitor.js