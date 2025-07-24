#!/bin/bash

echo "🎮 Starting DREX ARCADE - DATABASE DESTROYER"
echo ""
echo "Features:"
echo "  🕹️  RETRO ARCADE STYLE"
echo "  📊 TOP 10 HIGH SCORES"  
echo "  🌐 SHOWS IP ADDRESSES"
echo "  🎵 SOUND EFFECTS"
echo "  💾 SAVES TO arcade_scores.json"
echo ""
echo "High score = Any spike over 1000 QPS!"
echo ""

# Kill any existing monitors
pkill -f "node.*monitor" 2>/dev/null

# Start the arcade monitor
node arcade-monitor.js