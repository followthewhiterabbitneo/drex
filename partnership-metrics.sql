-- PARTNERSHIP METRICS - "It takes two to tango!"
-- These queries show BOTH sides need optimization

-- 1. THREAD POOL SATURATION (proves DB is trying its best)
SHOW STATUS LIKE '%thread%';
-- Key metrics:
-- Threads_created - if this keeps growing, thread pool is overwhelmed
-- Threadpool_threads - current threads
-- Threadpool_idle_threads - should have some idle, if 0 = maxed out

-- 2. QUERY CACHE MISSES (shows repetitive bad queries)
SHOW STATUS LIKE '%Qcache%';
-- Qcache_hits vs Qcache_inserts - low hit ratio = app sending unique queries
-- Qcache_lowmem_prunes - cache getting dumped due to memory

-- 3. TEMPORARY TABLES (bad query design)
SHOW STATUS LIKE '%tmp%';
-- Created_tmp_disk_tables - BAD! Queries need optimization
-- Created_tmp_tables - queries forcing temp tables

-- 4. TABLE SCANS (missing indexes from app side)
SHOW STATUS LIKE 'Handler_read%';
-- Handler_read_rnd_next - full table scans!
-- Compare to Handler_read_key - should use indexes

-- 5. SLOW QUERY LOG
SHOW VARIABLES LIKE 'slow_query%';
-- Enable and point to the app's queries

-- 6. CONNECTION TIME (app holding connections)
SELECT 
    USER,
    HOST,
    AVG(TIME) as avg_connection_time,
    MAX(TIME) as max_connection_time,
    COUNT(*) as connection_count
FROM information_schema.PROCESSLIST
GROUP BY USER, HOST
ORDER BY avg_connection_time DESC;

-- 7. QUERY PATTERNS (who's sending what)
SELECT 
    USER,
    SUBSTRING(INFO, 1, 50) as query_pattern,
    COUNT(*) as frequency
FROM information_schema.PROCESSLIST
WHERE INFO IS NOT NULL
GROUP BY USER, SUBSTRING(INFO, 1, 50)
ORDER BY frequency DESC;

-- 8. INNODB BUFFER POOL (is DB even warmed up?)
SHOW STATUS LIKE 'Innodb_buffer_pool%';
-- Innodb_buffer_pool_reads vs read_requests - high reads = not cached
-- Innodb_buffer_pool_wait_free - waiting for pages!

-- 9. COM COUNTERS (what commands are flooding us)
SHOW STATUS LIKE 'Com_%';
-- Com_select, Com_insert, Com_update - see the pattern

-- 10. BINLOG/REPLICATION LAG (if applicable)
SHOW SLAVE STATUS;
-- Seconds_Behind_Master - are we keeping up?