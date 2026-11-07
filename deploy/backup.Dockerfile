ARG MARIADB_IMAGE
ARG NODE_IMAGE
ARG RESTIC_IMAGE
FROM ${NODE_IMAGE} AS node
FROM ${RESTIC_IMAGE} AS restic
FROM ${MARIADB_IMAGE}
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY backup.mjs /ops/backup.mjs
COPY monitor.mjs /ops/monitor.mjs
COPY recovery-quarantine.sql /ops/recovery-quarantine.sql
RUN node --version && restic version && mariadb-dump --version && mkdir /status /repo && chown 10001:10001 /status /repo
USER 10001:10001
ENV RESTIC_CACHE_DIR=/tmp/restic-cache TZ=UTC
ENTRYPOINT ["node", "/ops/backup.mjs"]
