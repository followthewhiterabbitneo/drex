#!/bin/bash
# Check network and firewall settings

echo "🔍 Checking DREX network accessibility..."

# Check if DREX is running
echo -e "\n1. Checking if DREX is running:"
ps aux | grep -v grep | grep "legacy-monitor.js" || echo "❌ Not running"

# Check listening ports
echo -e "\n2. Checking listening ports:"
sudo netstat -tlnp | grep -E "3000|3001"

# Check firewall status
echo -e "\n3. Checking firewall:"
sudo firewall-cmd --state 2>/dev/null || echo "firewall-cmd not found"
sudo iptables -L -n | grep -E "3000|3001" 2>/dev/null || echo "No specific rules for DREX ports"

# Check if we can reach it locally
echo -e "\n4. Testing local access:"
curl -s http://localhost:3001/api/metrics | head -1 || echo "❌ API not responding"

# Try opening firewall ports
echo -e "\n5. Opening firewall ports (if using firewalld):"
sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null && echo "✅ Port 3000 opened"
sudo firewall-cmd --permanent --add-port=3001/tcp 2>/dev/null && echo "✅ Port 3001 opened"
sudo firewall-cmd --reload 2>/dev/null && echo "✅ Firewall reloaded"

# Alternative: open with iptables
echo -e "\n6. Opening ports with iptables (alternative):"
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null && echo "✅ Port 3000 opened (iptables)"
sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT 2>/dev/null && echo "✅ Port 3001 opened (iptables)"

# Update legacy monitor to listen on all interfaces
echo -e "\n7. Updating monitor to listen on all interfaces..."
sed -i "s/apiServer.listen(config.API_PORT/apiServer.listen(config.API_PORT, '0.0.0.0'/g" legacy-monitor.js
sed -i "s/webServer.listen(config.WEB_PORT/webServer.listen(config.WEB_PORT, '0.0.0.0'/g" legacy-monitor.js

echo -e "\n8. Restarting DREX with network access..."
pkill -f legacy-monitor.js
nohup node legacy-monitor.js > drex.log 2>&1 &

sleep 2

echo -e "\n✅ Network check complete!"
echo "Try accessing: http://s01vpsromuls001:3000"
echo "If still blocked, you may need to:"
echo "1. Check corporate firewall rules"
echo "2. Use SSH port forwarding: ssh -L 3000:localhost:3000 estillmane@s01vpsromuls001"