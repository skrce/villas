\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('villas.expected_business', :'business_id', true);
DO $$
BEGIN
  IF current_database() <> 'villarosa' OR NOT EXISTS (
    SELECT FROM property_identity WHERE singleton=1 AND property_id=current_setting('villas.expected_business')
  ) THEN
    RAISE EXCEPTION 'Business binding does not match the maintenance target';
  END IF;
END $$;
ALTER ROLE villas_runtime NOLOGIN;
COMMIT;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname=current_database() AND usename='villas_runtime' AND pid<>pg_backend_pid();
SELECT COUNT(*) AS remaining_runtime_connections FROM pg_stat_activity
  WHERE datname=current_database() AND usename='villas_runtime';
