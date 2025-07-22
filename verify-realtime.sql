-- Run these queries to verify DREX is showing real data

-- 1. Current connections (should match DREX)
SHOW STATUS LIKE 'Threads_connected';

-- 2. Max connections setting
SHOW VARIABLES LIKE 'max_connections';

-- 3. See WHO is connected (probably Tomcat!)
SELECT 
    user, 
    host,
    COUNT(*) as connection_count,
    GROUP_CONCAT(DISTINCT command) as commands
FROM information_schema.processlist 
GROUP BY user, SUBSTRING_INDEX(host, ':', 1)
ORDER BY connection_count DESC;

-- 4. Connections by application
SELECT 
    SUBSTRING_INDEX(host, ':', 1) as server,
    COUNT(*) as connections,
    SUM(CASE WHEN command = 'Sleep' THEN 1 ELSE 0 END) as idle_connections,
    SUM(CASE WHEN state LIKE '%lock%' THEN 1 ELSE 0 END) as locked
FROM information_schema.processlist
GROUP BY SUBSTRING_INDEX(host, ':', 1)
ORDER BY connections DESC;

-- 5. Active vs sleeping threads
SELECT 
    command,
    COUNT(*) as count,
    AVG(time) as avg_time
FROM information_schema.processlist
GROUP BY command;