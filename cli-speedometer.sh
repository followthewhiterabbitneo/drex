#!/bin/bash
# CLI Speedometer - Quick connection check from terminal

DB_HOST="s01vpsoxweb010"
DB_USER="DEA"
DB_PASS="hotchip"
DB_NAME="oreka"

# Colors for terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

clear
echo "==================================="
echo "    DREX CLI SPEEDOMETER"
echo "==================================="
echo ""

while true; do
    # Move cursor to top
    tput cup 5 0
    
    # Get current timestamp
    echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo ""
    
    # Quick connection count
    CONNECTIONS=$(mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -s -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST")
    echo -e "Total Connections: ${YELLOW}$CONNECTIONS${NC}"
    echo ""
    
    # Connection breakdown by user
    echo "Connections by User:"
    mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -s -e "
    SELECT 
        USER,
        COUNT(*) as conns,
        SUM(COMMAND='Sleep') as sleeping,
        SUM(COMMAND='Query') as active
    FROM information_schema.PROCESSLIST 
    GROUP BY USER 
    ORDER BY conns DESC" | while read user conns sleeping active; do
        if [[ $conns -gt 50 ]]; then
            echo -e "  ${RED}$user: $conns (Sleep:$sleeping Active:$active)${NC}"
        else
            echo -e "  $user: $conns (Sleep:$sleeping Active:$active)"
        fi
    done
    
    echo ""
    echo "Top IPs:"
    mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -s -e "
    SELECT 
        SUBSTRING_INDEX(HOST, ':', 1) as ip,
        COUNT(*) as conns
    FROM information_schema.PROCESSLIST 
    WHERE HOST IS NOT NULL
    GROUP BY ip 
    ORDER BY conns DESC 
    LIMIT 10" | while read ip conns; do
        if [[ $conns -gt 20 ]]; then
            echo -e "  ${RED}$ip: $conns${NC}"
        else
            echo -e "  $ip: $conns"
        fi
    done
    
    echo ""
    echo "Active Queries:"
    ACTIVE=$(mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -s -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE COMMAND='Query'")
    LOCKS=$(mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -s -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE STATE LIKE '%lock%'")
    echo -e "  Running: ${YELLOW}$ACTIVE${NC}"
    echo -e "  Waiting on locks: ${RED}$LOCKS${NC}"
    
    echo ""
    echo "-----------------------------------"
    echo "Press Ctrl+C to exit"
    
    sleep 2
done