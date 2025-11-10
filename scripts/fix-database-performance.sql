-- PostgreSQL Performance Optimization Script
-- Run this on the PostgreSQL database to fix severe latency issues

-- 1. Connection and Memory Settings
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- 2. Query Performance Settings
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET seq_page_cost = 1.0;
ALTER SYSTEM SET cpu_tuple_cost = 0.01;
ALTER SYSTEM SET cpu_index_tuple_cost = 0.005;
ALTER SYSTEM SET cpu_operator_cost = 0.0025;

-- 3. Checkpoint and WAL Settings
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET checkpoint_timeout = '10min';
ALTER SYSTEM SET max_wal_size = '1GB';
ALTER SYSTEM SET min_wal_size = '80MB';

-- 4. Connection and Timeout Settings
ALTER SYSTEM SET statement_timeout = '60s';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
ALTER SYSTEM SET lock_timeout = '30s';

-- 5. Logging for Performance Monitoring
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1 second
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_lock_waits = on;

-- 6. Autovacuum Settings for Better Performance
ALTER SYSTEM SET autovacuum = on;
ALTER SYSTEM SET autovacuum_max_workers = 3;
ALTER SYSTEM SET autovacuum_naptime = '1min';
ALTER SYSTEM SET autovacuum_vacuum_threshold = 50;
ALTER SYSTEM SET autovacuum_analyze_threshold = 50;

-- Apply the configuration changes
SELECT pg_reload_conf();

-- 7. Create indexes for common queries (if tables exist)
-- Note: These will only run if the tables exist

-- Index for pet insurance queries by pet_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pet_insurances') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pet_insurances_pet_id ON pet_insurances(pet_id);
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pet_insurances_created_at ON pet_insurances(created_at);
    END IF;
END $$;

-- Index for insurance queries
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insurances') THEN
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insurances_active ON insurances(active) WHERE active = true;
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insurances_type ON insurances(insurance_type);
    END IF;
END $$;

-- 8. Analyze tables for better query planning
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ANALYZE ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- 9. Show current configuration
SELECT name, setting, unit, context 
FROM pg_settings 
WHERE name IN (
    'max_connections', 'shared_buffers', 'effective_cache_size', 
    'work_mem', 'maintenance_work_mem', 'statement_timeout'
)
ORDER BY name;