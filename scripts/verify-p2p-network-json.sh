#!/usr/bin/env bash
# Verify {userData}/p2p/network.json satisfies WAN readiness (STUN + TURN + credentials).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK_JSON="${1:?usage: verify-p2p-network-json.sh <path/to/network.json>}"

if [[ ! -f "$NETWORK_JSON" ]]; then
  echo "FAIL: missing $NETWORK_JSON" >&2
  exit 1
fi

node "$ROOT_DIR/scripts/verify-p2p-network-json.js" "$NETWORK_JSON"
