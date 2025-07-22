-- Check current limits and usage to set dramatic speedometer ranges

-- 1. Check max connections setting
SHOW VARIABLES LIKE 'max_connections';

-- 2. Check historical peak connections
SHOW STATUS LIKE 'Max_used_connections';

-- 3. Check current vs max
SELECT 
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_STATUS WHERE VARIABLE_NAME = 'Threads_connected') as current_connections,
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_VARIABLES WHERE VARIABLE_NAME = 'max_connections') as max_connections,
    (SELECT VARIABLE_VALUE FROM INFORMATION_SCHEMA.SESSION_STATUS WHERE VARIABLE_NAME = 'Max_used_connections') as peak_connections;

-- 4. Check query stats
SHOW STATUS LIKE 'Questions';
SHOW STATUS LIKE 'Uptime';

-- 5. Check for slow queries
SHOW STATUS LIKE 'Slow_queries';

-- 6. Check table locks waited
SHOW STATUS LIKE 'Table_locks_waited';