#!/bin/sh
set -eu
read_secret() {
    value=$(cat "/run/secrets/$1")
    case "$value" in *[!a-f0-9]*|'') exit 1 ;; esac
    [ "${#value}" -eq 64 ] || exit 1
    printf '%s' "$value"
}
migration=$(read_secret db_migration)
runtime=$(read_secret db_runtime)
backup=$(read_secret db_backup)
psql --no-psqlrc --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<SQL
CREATE ROLE villas_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$migration';
CREATE ROLE villas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$runtime';
CREATE ROLE villas_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$backup';
REVOKE ALL ON DATABASE villarosa FROM PUBLIC;
GRANT CONNECT ON DATABASE villarosa TO villas_migration, villas_runtime, villas_backup;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO villas_migration;
GRANT USAGE ON SCHEMA public TO villas_runtime, villas_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE villas_migration IN SCHEMA public GRANT SELECT ON TABLES TO villas_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE villas_migration IN SCHEMA public GRANT SELECT ON SEQUENCES TO villas_backup;
SQL
