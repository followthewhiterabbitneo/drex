#!/bin/bash
# Start the SMOKING GUN monitor - shows the OBVIOUS problem!

echo "🔫 SMOKING GUN MONITOR 🔫"
echo "========================"
echo ""
echo "This shows the UNDENIABLE EVIDENCE:"
echo "  ✅ Normal baseline (even with 500 concurrent calls)"
echo "  💥 WHAMMO! Spikes every ~3 minutes"
echo "  📊 Visual proof - spikes in RED"
echo "  ⏱️  Pattern detection - proves it's clockwork"
echo ""
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "monitor.js" 2>/dev/null

# Start the smoking gun monitor
node smoking-gun-monitor.js