-- Check if performance_schema is available and what we can use

-- Is it enabled?
SHOW VARIABLES LIKE 'performance_schema';

-- If YES, here's the good stuff:

-- 1. Connection summary by host
SELECT 
    HOST,
    CURRENT_CONNECTIONS,
    TOTAL_CONNECTIONS
FROM performance_schema.hosts
ORDER BY CURRENT_CONNECTIONS DESC;

-- 2. Statement statistics (who's running what)
SELECT 
    DIGEST_TEXT,
    COUNT_STAR as exec_count,
    SUM_TIMER_WAIT/1000000000 as total_time_ms,
    AVG_TIMER_WAIT/1000000000 as avg_time_ms
FROM performance_schema.events_statements_summary_by_digest
ORDER BY COUNT_STAR DESC
LIMIT 20;

-- 3. Table access patterns
SELECT 
    OBJECT_SCHEMA,
    OBJECT_NAME,
    COUNT_READ,
    COUNT_WRITE,
    COUNT_FETCH,
    COUNT_INSERT,
    COUNT_UPDATE,
    COUNT_DELETE
FROM performance_schema.table_io_waits_summary_by_table
WHERE OBJECT_SCHEMA = 'oreka'
ORDER BY COUNT_WRITE DESC;

-- 4. Current connections with more detail
SELECT 
    HOST,
    USER,
    CURRENT_CONNECTIONS,
    TOTAL_CONNECTIONS,
    UNIQUE_HOSTS
FROM performance_schema.accounts
WHERE CURRENT_CONNECTIONS > 0
ORDER BY CURRENT_CONNECTIONS DESC;

-- 5. Lock waits (if supported)
SELECT * FROM performance_schema.metadata_locks
WHERE LOCK_STATUS = 'PENDING';

-- Quick check what tables we have:
SHOW TABLES FROM performance_schema LIKE '%conn%';
SHOW TABLES FROM performance_schema LIKE '%host%';
SHOW TABLES FROM performance_schema LIKE '%statement%';