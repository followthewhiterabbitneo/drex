#!/bin/bash
# Open firewall ports for DREX - run as root on server

echo "🔥 Opening DREX ports in firewall..."

# Method 1: firewalld (RHEL/CentOS 7+)
if command -v firewall-cmd &> /dev/null; then
    echo "Using firewalld..."
    firewall-cmd --permanent --add-port=3000/tcp
    firewall-cmd --permanent --add-port=3001/tcp
    firewall-cmd --reload
    echo "✅ Ports opened with firewalld"
fi

# Method 2: iptables (older systems)
if command -v iptables &> /dev/null; then
    echo "Adding iptables rules..."
    iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
    iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
    # Save rules
    if [ -f /etc/redhat-release ]; then
        service iptables save 2>/dev/null || iptables-save > /etc/sysconfig/iptables
    fi
    echo "✅ Ports opened with iptables"
fi

# Check what's listening
echo -e "\n📊 Current listeners:"
netstat -tlnp | grep -E "3000|3001"

# Test local access
echo -e "\n🧪 Testing local access:"
curl -s http://localhost:3001/api/metrics | head -c 100 && echo "..."

echo -e "\n✅ Firewall configured!"
echo "Try accessing directly:"
echo "  http://s01vpsromuls001:3000"
echo ""
echo "If still blocked, your corporate network may block these ports."
echo "In that case, use standard web ports:"
echo "  - Change 3000 to 80 (requires root)"
echo "  - Or use a reverse proxy"