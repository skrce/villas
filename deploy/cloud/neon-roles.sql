\set ON_ERROR_STOP on
BEGIN;
SET LOCAL createrole_self_grant = 'inherit,set';
DO $$
BEGIN
  IF current_database() <> 'villarosa' THEN
    RAISE EXCEPTION 'Connect to the isolated villarosa database first';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='villas_migration') THEN
    CREATE ROLE villas_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='villas_runtime') THEN
    CREATE ROLE villas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='villas_backup') THEN
    CREATE ROLE villas_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT FROM pg_roles r WHERE r.rolname IN ('villas_migration','villas_runtime','villas_backup')
      AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
        OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member=r.oid))
  ) THEN
    RAISE EXCEPTION 'Use SQL-created restricted roles without inherited Neon admin membership';
  END IF;
END $$;
REVOKE ALL ON DATABASE villarosa FROM PUBLIC;
GRANT CONNECT ON DATABASE villarosa TO villas_migration, villas_runtime, villas_backup;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO villas_migration;
GRANT USAGE ON SCHEMA public TO villas_runtime, villas_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE villas_migration IN SCHEMA public
  GRANT SELECT ON TABLES TO villas_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE villas_migration IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO villas_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO villas_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO villas_backup;
COMMIT;

-- Set passwords interactively with psql \password, outside git and command arguments.
