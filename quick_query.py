#!/usr/bin/env python3
import pymysql

# Direct query to check database activity
conn = pymysql.connect(
    host='s01vpsoxweb010',
    user='DEA',
    password='hotchip',
    database='oreka'
)

cursor = conn.cursor()

# Check connections
print("=== Current Database Activity ===")
cursor.execute("""
    SELECT USER, COUNT(*) as connections, 
           SUM(COMMAND='Sleep') as sleeping,
           SUM(COMMAND='Query') as active
    FROM information_schema.PROCESSLIST 
    GROUP BY USER 
    ORDER BY connections DESC
""")

for row in cursor.fetchall():
    print(f"User: {row[0]:<20} Total: {row[1]:<5} Sleeping: {row[2]:<5} Active: {row[3]}")

# Check for locks
print("\n=== Lock Status ===")
cursor.execute("""
    SELECT COUNT(*) 
    FROM information_schema.PROCESSLIST 
    WHERE STATE LIKE '%lock%'
""")
locks = cursor.fetchone()[0]
print(f"Processes waiting on locks: {locks}")

# Recent queries
print("\n=== Active Queries ===")
cursor.execute("""
    SELECT USER, TIME, STATE, LEFT(INFO, 100) as query
    FROM information_schema.PROCESSLIST 
    WHERE COMMAND = 'Query' AND INFO IS NOT NULL
    ORDER BY TIME DESC
    LIMIT 5
""")

for row in cursor.fetchall():
    print(f"User: {row[0]}, Time: {row[1]}s, State: {row[2]}")
    print(f"Query: {row[3]}...")
    print()

cursor.close()
conn.close()