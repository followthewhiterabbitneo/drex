-- DREX Verification Commands for MariaDB
-- Run these in MariaDB shell to verify DREX accuracy

-- 1. Check active connections (should match DREX)
SHOW STATUS LIKE 'Threads_connected';

-- 2. Check running threads (active queries)
SHOW STATUS LIKE 'Threads_running';

-- 3. Check denied/aborted connections
SHOW STATUS LIKE 'Aborted_connects';

-- 4. Calculate queries per second
SELECT 
    VARIABLE_VALUE as total_queries 
FROM INFORMATION_SCHEMA.SESSION_STATUS 
WHERE VARIABLE_NAME = 'Questions';

SHOW STATUS LIKE 'Uptime';
-- QPS = Questions / Uptime

-- 5. See current locks (most important!)
SHOW PROCESSLIST;

-- 6. Detailed lock information
SELECT 
    id, user, host, db, command, time, state, info 
FROM INFORMATION_SCHEMA.PROCESSLIST 
WHERE state LIKE '%lock%' 
OR state LIKE '%wait%';

-- 7. Check max connections setting
SHOW VARIABLES LIKE 'max_connections';

-- 8. Full diagnostic query - all metrics at once
SELECT 
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_STATUS WHERE VARIABLE_NAME = 'Threads_connected') as connections,
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_STATUS WHERE VARIABLE_NAME = 'Threads_running') as running,
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_STATUS WHERE VARIABLE_NAME = 'Aborted_connects') as denied,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.PROCESSLIST WHERE state LIKE '%lock%') as locked_queries;

-- 9. Show who's causing locks
SELECT 
    user, 
    COUNT(*) as lock_count,
    GROUP_CONCAT(DISTINCT state) as states,
    MAX(time) as max_wait_time
FROM INFORMATION_SCHEMA.PROCESSLIST 
WHERE state LIKE '%lock%'
GROUP BY user
ORDER BY lock_count DESC;