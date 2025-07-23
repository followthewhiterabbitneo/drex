#!/bin/bash
# Start the secret evidence collector

echo "🕵️ Starting Evidence Collector..."
echo "This runs silently in the background"
echo "Evidence saved to: oreka-evidence.json"
echo ""

# Run in background
nohup node evidence-collector.js > evidence-collector.log 2>&1 &
echo "Evidence collector PID: $!"
echo ""
echo "To check evidence:"
echo "  cat oreka-evidence.json"
echo ""
echo "To stop collector:"
echo "  pkill -f evidence-collector.js"