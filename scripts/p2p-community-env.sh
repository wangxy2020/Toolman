#!/usr/bin/env bash
# Shared Community Hub settings for dual-instance P2P dev.
# Both instances use the same SQLite DB and JWT secret; instance B attaches to A's hub when running.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_P2P_TURN="$ROOT_DIR/.env.p2p.turn"
if [[ -f "$ENV_P2P_TURN" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_P2P_TURN"
  set +a
fi

export TOOLMAN_COMMUNITY_DATA_DIR="${TOOLMAN_COMMUNITY_DATA_DIR:-/tmp/toolman-community-shared}"
export TOOLMAN_COMMUNITY_JWT_SECRET="${TOOLMAN_COMMUNITY_JWT_SECRET:-toolman-dev-community-jwt-secret}"
export TOOLMAN_P2P_IDENTITY_STORAGE="${TOOLMAN_P2P_IDENTITY_STORAGE:-file}"
export COMMUNITY_HUB_REQUIRE_REVIEW="${COMMUNITY_HUB_REQUIRE_REVIEW:-true}"
export COMMUNITY_HUB_DEV_TEST_ROLES="${COMMUNITY_HUB_DEV_TEST_ROLES:-true}"
export COMMUNITY_HUB_ALLOW_HEADER_AUTH="${COMMUNITY_HUB_ALLOW_HEADER_AUTH:-1}"
export COMMUNITY_HUB_RATE_LIMIT_RPM="${COMMUNITY_HUB_RATE_LIMIT_RPM:-0}"

mkdir -p "$TOOLMAN_COMMUNITY_DATA_DIR"
