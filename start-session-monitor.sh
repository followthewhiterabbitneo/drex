#!/bin/bash

echo "🏆 Starting DREX SESSION MONITOR..."
echo ""
echo "Tracking THIS SESSION:"
echo "  - TODAY'S HIGH: Best QPS today"
echo "  - SESSION HIGH: Best since you started watching"
echo "  - LAST HOUR: Recent peak activity"
echo ""
echo "When you see a big spike:"
echo "  1. Note the SESSION HIGH"
echo "  2. Take a screenshot!"
echo "  3. We'll add to ALL-TIME records with evidence"
echo ""

# Kill any existing monitors
pkill -f "node.*monitor" 2>/dev/null

# Start the session monitor
node highscore-monitor.js