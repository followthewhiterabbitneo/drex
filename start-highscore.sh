#!/bin/bash

echo "🏆 Starting DREX HIGH SCORE TRACKER..."
echo ""
echo "This will track:"
echo "  - TODAY'S HIGH: Best QPS today"
echo "  - ALL-TIME RECORD: Highest ever (29,000 QPS!)"
echo "  - LAST HOUR PEAK: Recent activity"
echo "  - SPIKE COUNT: How many times over 1000 QPS"
echo ""
echo "High scores are SAVED - even if they try to hide!"
echo ""

# Kill any existing monitors
pkill -f "node.*monitor" 2>/dev/null

# Start the high score tracker
node highscore-monitor.js