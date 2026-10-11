#!/bin/sh
# Adds the tailcoat sites to Caddy once DNS points here, then reloads Caddy.
#   ./scripts/site-live.sh
set -e
IP=13.140.56.191
for h in tailcoat.adilhusain.xyz agent.tailcoat.adilhusain.xyz; do
  if ! dig +short A "$h" | grep -q "$IP"; then echo "$h does not resolve to $IP yet"; exit 1; fi
done
if grep -q "^tailcoat.adilhusain.xyz" /etc/caddy/Caddyfile; then echo "already in Caddyfile"; exit 0; fi
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)-pre-tailcoat"
cat >> /etc/caddy/Caddyfile <<'CADDY'

tailcoat.adilhusain.xyz {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3300
}

agent.tailcoat.adilhusain.xyz {
	encode zstd gzip
	reverse_proxy 127.0.0.1:9000
}
CADDY
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy && echo "live"
