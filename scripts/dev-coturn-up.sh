#!/usr/bin/env bash
# Start local coturn for dev WAN readiness / LAN TURN relay tests.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/infra/dev-coturn"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required for local coturn (install Docker Desktop)" >&2
  exit 1
fi

cd "$COMPOSE_DIR"
docker compose up -d

LAN_IP="$(bash "$ROOT_DIR/scripts/resolve-lan-ip.sh")"

cat <<EOF
Local coturn is running (host network, port 3478).

Dev credentials (NOT for production):
  TOOLMAN_P2P_TURN_USERNAME=toolman
  TOOLMAN_P2P_TURN_CREDENTIAL=dev-turn-local
  TOOLMAN_P2P_TURN_URL=turn:${LAN_IP}:3478?transport=udp

Stop: docker compose -f infra/dev-coturn/docker-compose.yml down
EOF
