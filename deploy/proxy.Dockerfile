ARG CADDY_IMAGE
FROM ${CADDY_IMAGE}
COPY Caddyfile /etc/caddy/Caddyfile
COPY maintenance.Caddyfile /etc/caddy/maintenance.Caddyfile
