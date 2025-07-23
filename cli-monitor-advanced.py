#!/usr/bin/env python3
"""
Advanced CLI Monitor - Uses performance_schema if available
Shows real-time connection and query metrics in terminal
"""

import os
import sys
import time
import mysql.connector
from datetime import datetime

# Colors for terminal
class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

# Database config
config = {
    'host': 's01vpsoxweb010',
    'user': 'DEA',
    'password': 'hotchip',
    'database': 'oreka'
}

def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

def get_connection():
    return mysql.connector.connect(**config)

def check_performance_schema(cursor):
    """Check if performance_schema is available"""
    cursor.execute("SHOW VARIABLES LIKE 'performance_schema'")
    result = cursor.fetchone()
    return result and result[1] == 'ON' if result else False

def get_basic_stats(cursor):
    """Get stats from information_schema (always available)"""
    # Total connections
    cursor.execute("SELECT COUNT(*) FROM information_schema.PROCESSLIST")
    total_conn = cursor.fetchone()[0]
    
    # By user
    cursor.execute("""
        SELECT USER, COUNT(*) as cnt,
               SUM(COMMAND='Sleep') as sleeping,
               SUM(COMMAND='Query') as active
        FROM information_schema.PROCESSLIST
        GROUP BY USER
        ORDER BY cnt DESC
    """)
    users = cursor.fetchall()
    
    # By IP
    cursor.execute("""
        SELECT SUBSTRING_INDEX(HOST, ':', 1) as ip, COUNT(*) as cnt
        FROM information_schema.PROCESSLIST
        WHERE HOST IS NOT NULL
        GROUP BY ip
        ORDER BY cnt DESC
        LIMIT 10
    """)
    ips = cursor.fetchall()
    
    # QPS estimate
    cursor.execute("SHOW GLOBAL STATUS LIKE 'Questions'")
    questions = int(cursor.fetchone()[1])
    
    return {
        'total_connections': total_conn,
        'users': users,
        'ips': ips,
        'questions': questions
    }

def get_performance_stats(cursor):
    """Get enhanced stats from performance_schema"""
    stats = {}
    
    try:
        # Connection summary by host
        cursor.execute("""
            SELECT HOST, CURRENT_CONNECTIONS, TOTAL_CONNECTIONS
            FROM performance_schema.hosts
            WHERE HOST IS NOT NULL
            ORDER BY CURRENT_CONNECTIONS DESC
            LIMIT 10
        """)
        stats['hosts'] = cursor.fetchall()
    except:
        stats['hosts'] = []
    
    try:
        # Hot queries
        cursor.execute("""
            SELECT DIGEST_TEXT, COUNT_STAR, 
                   SUM_TIMER_WAIT/1000000000000 as total_sec
            FROM performance_schema.events_statements_summary_by_digest
            WHERE DIGEST_TEXT IS NOT NULL
            ORDER BY COUNT_STAR DESC
            LIMIT 5
        """)
        stats['hot_queries'] = cursor.fetchall()
    except:
        stats['hot_queries'] = []
    
    return stats

def display_stats(basic_stats, perf_stats, has_perf_schema, last_questions, elapsed_time):
    """Display stats in a nice CLI format"""
    clear_screen()
    
    # Header
    print(f"{Colors.BOLD}{Colors.CYAN}====================================={Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}     DREX CLI MONITOR{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}====================================={Colors.RESET}")
    print(f"{Colors.GREEN}{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{Colors.RESET}")
    
    # QPS calculation
    if last_questions > 0 and elapsed_time > 0:
        qps = (basic_stats['questions'] - last_questions) / elapsed_time
        qps_color = Colors.RED if qps > 1000 else Colors.YELLOW if qps > 500 else Colors.GREEN
        print(f"\n{Colors.BOLD}QPS: {qps_color}{int(qps)}{Colors.RESET}")
    
    # Total connections
    conn_color = Colors.RED if basic_stats['total_connections'] > 100 else Colors.YELLOW if basic_stats['total_connections'] > 50 else Colors.GREEN
    print(f"\n{Colors.BOLD}Total Connections: {conn_color}{basic_stats['total_connections']}{Colors.RESET}")
    
    # Users
    print(f"\n{Colors.BOLD}Connections by User:{Colors.RESET}")
    for user, total, sleeping, active in basic_stats['users']:
        color = Colors.RED if total > 50 else Colors.YELLOW if total > 20 else Colors.WHITE
        print(f"  {color}{user:<20} Total:{total:<4} Sleep:{sleeping:<4} Active:{active}{Colors.RESET}")
    
    # IPs
    print(f"\n{Colors.BOLD}Top IPs:{Colors.RESET}")
    for ip, count in basic_stats['ips']:
        color = Colors.RED if count > 20 else Colors.YELLOW if count > 10 else Colors.WHITE
        # Highlight potential Oreka pods
        pod_marker = " [POD]" if count > 15 else ""
        print(f"  {color}{ip:<20} {count}{pod_marker}{Colors.RESET}")
    
    # Performance schema stats if available
    if has_perf_schema and perf_stats.get('hosts'):
        print(f"\n{Colors.BOLD}Performance Schema - Host Details:{Colors.RESET}")
        for host, current, total in perf_stats['hosts'][:5]:
            print(f"  {host:<20} Current:{current:<4} Total:{total}")
    
    print(f"\n{Colors.CYAN}Press Ctrl+C to exit{Colors.RESET}")

def main():
    conn = None
    cursor = None
    last_questions = 0
    last_time = time.time()
    
    try:
        while True:
            try:
                if not conn or not conn.is_connected():
                    conn = get_connection()
                    cursor = conn.cursor()
                
                # Check if performance_schema is available
                has_perf_schema = check_performance_schema(cursor)
                
                # Get stats
                basic_stats = get_basic_stats(cursor)
                perf_stats = get_performance_stats(cursor) if has_perf_schema else {}
                
                # Calculate elapsed time
                current_time = time.time()
                elapsed_time = current_time - last_time if last_questions > 0 else 0
                
                # Display
                display_stats(basic_stats, perf_stats, has_perf_schema, 
                            last_questions, elapsed_time)
                
                # Update for next iteration
                last_questions = basic_stats['questions']
                last_time = current_time
                
                time.sleep(2)
                
            except mysql.connector.Error as e:
                print(f"{Colors.RED}Database error: {e}{Colors.RESET}")
                time.sleep(5)
                
    except KeyboardInterrupt:
        print(f"\n{Colors.GREEN}Exiting...{Colors.RESET}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    main()