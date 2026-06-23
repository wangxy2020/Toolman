#!/usr/bin/env bash
# Shared Community Hub settings for dual-instance P2P dev.
# Both instances use the same SQLite DB and JWT secret; instance B attaches to A's hub when running.

export TOOLMAN_COMMUNITY_DATA_DIR="${TOOLMAN_COMMUNITY_DATA_DIR:-/tmp/toolman-community-shared}"
export TOOLMAN_COMMUNITY_JWT_SECRET="${TOOLMAN_COMMUNITY_JWT_SECRET:-toolman-dev-community-jwt-secret}"

mkdir -p "$TOOLMAN_COMMUNITY_DATA_DIR"
