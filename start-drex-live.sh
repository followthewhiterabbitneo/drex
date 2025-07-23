#!/bin/bash
# Start DREX with LIVE needle movement!

echo "🎯 DREX LIVE SPEEDOMETER 🎯"
echo "=========================="
echo ""
echo "Starting with enhanced needle movement..."
echo "Watch those needles DANCE!"
echo ""

# Kill any existing monitors
pkill -f "speedometer.js" 2>/dev/null
pkill -f "monitor.js" 2>/dev/null

# Add a small delay to ensure clean start
sleep 1

# Start the speedometer
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""
echo "Needles will move smoothly even with small changes!"
echo ""

node drex-speedometer.js