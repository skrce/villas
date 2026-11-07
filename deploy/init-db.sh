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
MYSQL_PWD=$(cat /run/secrets/db_root) mariadb --user=root <<SQL
CREATE DATABASE IF NOT EXISTS villarosa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'villas_migration'@'%' IDENTIFIED BY '$migration';
CREATE USER IF NOT EXISTS 'villas_runtime'@'%' IDENTIFIED BY '$runtime';
CREATE USER IF NOT EXISTS 'villas_backup'@'%' IDENTIFIED BY '$backup';
GRANT ALL PRIVILEGES ON villarosa.* TO 'villas_migration'@'%';
GRANT SELECT, SHOW VIEW ON villarosa.* TO 'villas_backup'@'%';
SQL
