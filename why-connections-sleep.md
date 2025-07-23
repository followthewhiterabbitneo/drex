# Why Do Connections Sleep? 😴

## The Truth: Queries Don't Sleep - CONNECTIONS Do!

When you see "Sleep" in PROCESSLIST, it means:
- The connection is OPEN
- But it's doing NOTHING
- Just... sitting there... waiting...

## Common Reasons for Sleeping Connections

### 1. **Connection Pooling Gone Wrong**
```java
// BAD: App opens connection and keeps it forever
Connection conn = getConnection();
// ... do one query ...
// ... then NEVER close it ...
// Connection sleeps for eternity!
```

### 2. **"Just In Case" Connections**
- App: "I might need this later"
- Opens 100 connections
- Uses 5
- Other 95 sleep forever

### 3. **Persistent Connections Without Reuse**
```php
// PHP with persistent connections
$conn = mysql_pconnect($host, $user, $pass);
// Does one query
// Script ends but connection stays open
// SLEEPING...
```

### 4. **Transaction Left Open**
```sql
START TRANSACTION;
SELECT * FROM users WHERE id = 1;
-- Oops, forgot to COMMIT or ROLLBACK
-- Connection sleeps holding locks!
```

### 5. **Application Idle Time**
- Web app waiting for user input
- Background job between tasks
- Service waiting for next request
- Connection just... sleeps

### 6. **Connection Pool Minimums**
```yaml
# Connection pool config
min_connections: 50  # Always keep 50 open
max_connections: 200
# If only 10 active users, 40 connections sleep
```

## The Real Problem Pattern

**Your Call Analytics App probably does this:**

```pseudocode
Every 3 minutes:
  1. Wake up
  2. Open 50 new connections
  3. Blast 4000 queries in 1 second
  4. Go back to sleep
  5. Leave connections open "just in case"
  6. REPEAT
```

**Meanwhile, those connections:**
- Take up memory
- Hold thread pool slots
- Prevent other apps from connecting
- Just SLEEP... 😴

## The Restaurant Analogy

Imagine a restaurant with 100 tables:
- Customer comes in, orders, eats (active query)
- Then falls asleep at the table (sleeping connection)
- Won't leave, won't order more
- New customers can't get tables
- Restaurant (database) is "full" but not serving anyone!

## How to Fix Sleeping Connections

### 1. **Proper Connection Management**
```java
try (Connection conn = getConnection()) {
    // Use it
    // Auto-closes when done
}
```

### 2. **Connection Pool Timeouts**
```properties
max_idle_time=60  # Close if idle for 60 seconds
```

### 3. **Database Settings**
```sql
-- MariaDB/MySQL
SET GLOBAL wait_timeout=300;  -- Kill sleeping connections after 5 minutes
SET GLOBAL interactive_timeout=300;
```

### 4. **Use Connection Pooling Correctly**
- Set reasonable min/max
- Enable idle timeouts
- Test connections before use
- Return connections to pool immediately

## The Smoking Gun

When DREX shows:
- 300 sleeping connections
- 20 active queries
- 4000 QPS spike

That means: **93% of connections are doing NOTHING!**

That's not a database problem - that's an application hoarding problem! 🐷