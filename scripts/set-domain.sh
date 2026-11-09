#!/usr/bin/env bash
# Move the CMMS to a new address, e.g. from 84-8-106-22.sslip.io to app.plantpulse-cmms.com, without breaking anyone:
# the old address keeps serving the same app (phones with the old Play app version, bookmarks) until you remove it.
#
#   sudo bash scripts/set-domain.sh app.plantpulse-cmms.com      switch (checks the DNS record first)
#   sudo bash scripts/set-domain.sh --drop-old                    later: the old address only redirects to the new one
#
# Before: a DNS "A" record for the new name pointing to this server (Cloudflare: "DNS only", grey cloud).
# Nothing in the database changes. E-mail links (password reset, daily summary) use the new address afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $EUID -eq 0 ]] || { echo "Run with sudo: sudo bash scripts/set-domain.sh ${1:-<new-address>}"; exit 1; }
[[ -f deploy/.env ]] || { echo "deploy/.env not found: install the CMMS first (deploy/install-server.sh)."; exit 1; }
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

ENVF=deploy/.env
PREV=deploy/caddy.d/00-previous-address.caddy
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$ENVF")
getenv() { grep -s "^$1=" "$ENVF" | tail -n1 | cut -d= -f2- || true; }
setenv() {
  local tmp; tmp="$(mktemp)"
  grep -sv "^$1=" "$ENVF" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$ENVF"; rm -f "$tmp"
}
validate() {  # a mistake in the Caddy files must never take the sites down
  local img; img="$(grep -m1 'image: caddy:' deploy/docker-compose.yml | awk '{print $2}')"
  docker run --rm -e "CMMS_DOMAIN=$1" -e "PRODUCT_DOMAIN=$(getenv PRODUCT_DOMAIN)" \
    -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PWD/deploy/caddy.d:/etc/caddy/caddy.d:ro" \
    "${img:-caddy:2.10.2-alpine}" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/caddy-validate.log 2>&1
}
wait_https() {  # address -> 0 when the app answers over HTTPS (certificate issued)
  for _ in $(seq 1 40); do
    curl -fsS -o /dev/null --max-time 5 "https://$1/api/v1/health/live" && return 0
    sleep 3
  done
  return 1
}

CUR="$(getenv CMMS_DOMAIN)"
mkdir -p deploy/caddy.d

if [[ "${1:-}" == "--drop-old" ]]; then
  [[ -f "$PREV" ]] || { echo "No previous address is being served."; exit 0; }
  OLD="$(head -n1 "$PREV" | awk '{print $1}')"
  log "The old address $OLD now redirects to https://$CUR"
  cp "$PREV" "$PREV.bak"
  printf '%s {\n\tredir https://%s{uri} permanent\n}\n' "$OLD" "$CUR" > "$PREV"
  if ! validate "$CUR"; then mv "$PREV.bak" "$PREV"; echo "Caddy check failed, nothing changed:"; tail -5 /tmp/caddy-validate.log; exit 1; fi
  rm -f "$PREV.bak"
  "${COMPOSE[@]}" restart caddy >/dev/null
  echo "Done."
  exit 0
fi

NEW="${1:-}"
[[ "$NEW" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "Give the new address, e.g.: sudo bash scripts/set-domain.sh app.plantpulse-cmms.com"; exit 1; }
[[ "$NEW" != "$CUR" ]] || { echo "The CMMS already uses https://$NEW"; exit 0; }

log "Checking the DNS record of $NEW"
IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)"
DNS="$(getent ahostsv4 "$NEW" | awk 'NR==1{print $1}' || true)"
if [[ "$DNS" != "$IP" ]]; then
  echo "$NEW points to '${DNS:-nothing}', but this server is $IP."
  echo "Add an A record: name = ${NEW%%.*}, value = $IP, proxy status = DNS only (grey cloud). Then wait a minute and run this again."
  exit 1
fi
echo "OK: $NEW -> $IP"

log "Switching from https://$CUR to https://$NEW (the old address keeps working)"
cp "$ENVF" "$ENVF.bak"
printf '%s {\n\timport cmms_app\n}\n' "$CUR" > "$PREV"
if ! validate "$NEW"; then
  rm -f "$PREV"; echo "Caddy check failed, nothing changed:"; tail -5 /tmp/caddy-validate.log; exit 1
fi
setenv CMMS_DOMAIN "$NEW"
"${COMPOSE[@]}" up -d >/dev/null 2>&1   # Caddy, API and worker pick up the new address

log "Waiting for the certificate of $NEW (up to 2 minutes)"
if wait_https "$NEW"; then
  echo "OK: https://$NEW"
else
  echo "https://$NEW does not answer yet. Check the DNS record is 'DNS only', then: sudo docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs caddy | tail"
fi
wait_https "$CUR" && echo "OK: the old address https://$CUR still works" || echo "Note: https://$CUR does not answer"
log "Done"
echo "New address: https://$NEW   (old: https://$CUR keeps working)"
echo "Backup of the previous settings: $ENVF.bak"
