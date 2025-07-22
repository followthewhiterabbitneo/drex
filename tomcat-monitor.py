#!/usr/bin/env python3
"""
Tomcat JMX Monitoring Integration for DREX
Monitors Tomcat metrics via JMX if available
"""

import requests
import json
import time
from datetime import datetime

# Tomcat Manager configuration
TOMCAT_CONFIG = {
    'host': 's01vpsoxweb010',  # Same server as MariaDB
    'port': 8080,              # Default Tomcat port
    'manager_path': '/manager/status',
    'jmx_path': '/manager/jmxproxy',
    'username': 'admin',       # Update with actual credentials
    'password': 'admin'        # Update with actual credentials
}

def get_tomcat_stats():
    """Fetch Tomcat statistics via manager API"""
    try:
        # Try manager status endpoint
        url = f"http://{TOMCAT_CONFIG['host']}:{TOMCAT_CONFIG['port']}{TOMCAT_CONFIG['manager_path']}"
        response = requests.get(url, auth=(TOMCAT_CONFIG['username'], TOMCAT_CONFIG['password']), timeout=5)
        
        if response.status_code == 200:
            return parse_tomcat_status(response.text)
        else:
            print(f"Tomcat manager returned {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Could not connect to Tomcat: {e}")
        return None

def parse_tomcat_status(status_text):
    """Parse Tomcat status page"""
    stats = {
        'timestamp': datetime.now().isoformat(),
        'connectors': {},
        'thread_pools': {},
        'memory': {}
    }
    
    # This would parse the HTML/XML status page
    # For now, return sample structure
    return {
        'timestamp': datetime.now().isoformat(),
        'connectors': {
            'http-8080': {
                'current_threads': 25,
                'busy_threads': 5,
                'max_threads': 200
            }
        },
        'datasources': {
            'jdbc/oreka': {
                'active': 15,
                'idle': 10,
                'max': 50
            }
        }
    }

def get_jmx_metrics():
    """Fetch detailed JMX metrics if available"""
    jmx_queries = [
        'java.lang:type=Threading',
        'java.lang:type=Memory',
        'Catalina:type=DataSource,*',
        'Catalina:type=ThreadPool,*'
    ]
    
    metrics = {}
    for query in jmx_queries:
        try:
            url = f"http://{TOMCAT_CONFIG['host']}:{TOMCAT_CONFIG['port']}{TOMCAT_CONFIG['jmx_path']}"
            params = {'qry': query}
            response = requests.get(url, params=params, 
                                  auth=(TOMCAT_CONFIG['username'], TOMCAT_CONFIG['password']), 
                                  timeout=5)
            if response.status_code == 200:
                metrics[query] = response.json()
        except:
            pass
    
    return metrics

if __name__ == "__main__":
    print("🍅 Tomcat Monitor for DREX")
    print("=" * 50)
    
    # Test connection
    stats = get_tomcat_stats()
    if stats:
        print("✅ Connected to Tomcat")
        print(json.dumps(stats, indent=2))
    else:
        print("❌ Could not connect to Tomcat")
        print("\nPossible reasons:")
        print("1. Tomcat manager app not deployed")
        print("2. Wrong credentials")
        print("3. Tomcat on different port")
        print("4. Firewall blocking connection")
    
    # Try JMX
    print("\n🔧 Checking JMX...")
    jmx = get_jmx_metrics()
    if jmx:
        print("✅ JMX data available")
    else:
        print("❌ JMX not accessible")