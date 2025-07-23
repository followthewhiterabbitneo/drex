#!/bin/bash
# Start the RAPID SPIKE monitor - catches spikes every 30 seconds!

echo "🚨 RAPID FIRE SPIKE MONITOR 🚨"
echo "============================="
echo ""
echo "This catches FAST spikes:"
echo "  ⚡ Samples twice per second"
echo "  🔥 Detects spikes every 30 seconds"
echo "  📊 Shows exact spike times"
echo "  🚀 High resolution monitoring"
echo ""
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "monitor.js" 2>/dev/null

# Start the rapid spike monitor
node rapid-spike-monitor.js