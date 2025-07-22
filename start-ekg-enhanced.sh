#!/bin/bash
# Start the Enhanced EKG monitor - Jurassic Park style with lock detection!

echo "💚 DREX EKG ENHANCED MONITOR 💚"
echo "=============================="
echo ""
echo "Jurassic Park style monitoring showing:"
echo "  📈 Query spikes with EKG heartbeat"
echo "  🔒 Lock detection and waiting"
echo "  🏷️ ORKTAG table activity monitoring"
echo "  🚨 Real-time alerts for spikes and locks"
echo "  📊 Pattern analysis - proves the 3-minute cycle"
echo ""
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "monitor.js" 2>/dev/null

# Start the enhanced EKG monitor
node ekg-enhanced.js