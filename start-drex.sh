#!/bin/bash
# Start DREX SPEEDOMETER - Database Real-time EXaminer

cat << "EOF"
====================================
    D R E X   S P E E D O M E T E R
====================================
      Database Real-time EXaminer

EOF

echo "Starting DREX monitoring dashboard..."
echo ""
echo "Features:"
echo "  - Query rate speedometer (redlines at 3000 QPS)"
echo "  - Connection count gauge"
echo "  - Sleeping connections monitor"
echo "  - Lock wait detector"
echo ""
echo "Dashboard: http://s01vpsromuls001:3000"
echo ""

# Kill any existing monitors
pkill -f "monitor.js" 2>/dev/null

# Start DREX speedometer
node drex-speedometer.js