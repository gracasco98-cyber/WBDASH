#!/bin/sh
set -e

# Railway's private-network DNS isn't a fixed, documented IP — read whatever
# resolver the container actually has (from /etc/resolv.conf) and inject it
# into the nginx config. Only $RESOLVER_IP is substituted; every other
# nginx $variable ($host, $remote_addr, ...) is left untouched.
RESOLVER_IP="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)"
echo "[entrypoint] using resolver: ${RESOLVER_IP}"

export RESOLVER_IP
envsubst '${RESOLVER_IP}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
