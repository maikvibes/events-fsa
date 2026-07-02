#!/usr/bin/env bash
# Updates /etc/hosts with stable names -> docker container IPs for the
# events-fsa infra. Idempotent. Requires sudo.
#
# The IPs must match the fixed-IP assignments in docker-compose.infra.yml.
# If you change the subnet there, update SERVICE_IPS below as well.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SERVICE_IPS=(
  "172.30.0.10 postgres"
  "172.30.0.11 kafka"
  "172.30.0.12 redis"
)

MARKER="# events-fsa: managed by scripts/generate-hosts.sh - do not edit"

if [[ ! -f /etc/hosts ]]; then
  echo "/etc/hosts not found" >&2
  exit 1
fi

# Build the new block
NEW_BLOCK="$MARKER"
for entry in "${SERVICE_IPS[@]}"; do
  NEW_BLOCK+=$'\n'"$entry"
done

TMP="$(mktemp)"
# Drop any previous block we own
awk -v marker="$MARKER" '
  $0 == marker { in_block = 1; next }
  in_block && /^172\.30\./ { next }
  in_block && /^(postgres|kafka|redis)[[:space:]]/ { next }
  in_block && NF == 0 { in_block = 0; print; next }
  in_block { in_block = 0 }
  { print }
' /etc/hosts > "$TMP"

# Append our block (always)
printf '\n%s\n' "$NEW_BLOCK" >> "$TMP"

if cmp -s /etc/hosts "$TMP"; then
  rm -f "$TMP"
  echo "hosts file already up to date"
  exit 0
fi

echo "Updating /etc/hosts:"
diff /etc/hosts "$TMP" || true
echo "221205" | sudo -S cp "$TMP" /etc/hosts
rm -f "$TMP"
echo "Done. Resolved names:"
for entry in "${SERVICE_IPS[@]}"; do
  read -r ip name <<<"$entry"
  printf "  %-12s %s\n" "$name" "$(getent hosts "$name" | awk '{print $1}')"
done
