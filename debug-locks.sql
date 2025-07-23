-- Debug queries to see what lock states look like

-- Show current process list with all details
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO 
FROM information_schema.PROCESSLIST 
WHERE STATE IS NOT NULL 
ORDER BY TIME DESC;

-- Show InnoDB lock waits
SELECT 
    r.trx_id waiting_trx_id,
    r.trx_mysql_thread_id waiting_thread,
    r.trx_query waiting_query,
    b.trx_id blocking_trx_id,
    b.trx_mysql_thread_id blocking_thread,
    b.trx_query blocking_query
FROM information_schema.innodb_lock_waits w
INNER JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
INNER JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id;

-- Show all active InnoDB transactions
SELECT * FROM information_schema.INNODB_TRX;

-- Common lock-related states to look for:
-- 'Waiting for table metadata lock'
-- 'Waiting for table flush'
-- 'Waiting for table level lock'
-- 'Sending data' (can indicate lock contention)
-- 'Locked' 
-- 'Table lock'
-- 'Waiting on cond'