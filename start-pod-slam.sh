#!/bin/bash
# Start POD SLAM monitor - Shows 8 pods attacking 1 database!

cat << "EOF"
⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️
    POD SLAM MONITOR
⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️⚔️

  8 OREKA PODS vs 1 DATABASE
  
  Your App: 😇 Respects limits, steady load
  Their App: 😈 8 pods, burst attacks!
  
  "Enterprise tool" = Enterprise PROBLEM
  
EOF

echo "Starting Pod Slam visualization..."
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "monitor.js" 2>/dev/null

# Start pod slam monitor
node pod-slam-monitor.js