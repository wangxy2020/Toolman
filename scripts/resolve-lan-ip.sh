#!/usr/bin/env bash
# Print primary LAN IPv4 (macOS/Linux). Falls back to 127.0.0.1.
set -euo pipefail

if [[ "$(uname -s)" == "Darwin" ]]; then
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      printf '%s' "$ip"
      exit 0
    fi
  done
fi

if command -v ip >/dev/null 2>&1; then
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}' || true
  exit 0
fi

printf '%s' '127.0.0.1'
