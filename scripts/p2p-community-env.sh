#!/usr/bin/env bash
# Shared Community Hub settings for dual-instance P2P dev.
# Both instances use the same SQLite DB and JWT secret; instance B attaches to A's hub when running.

export TOOLMAN_COMMUNITY_DATA_DIR="${TOOLMAN_COMMUNITY_DATA_DIR:-/tmp/toolman-community-shared}"
export TOOLMAN_COMMUNITY_JWT_SECRET="${TOOLMAN_COMMUNITY_JWT_SECRET:-toolman-dev-community-jwt-secret}"
export TOOLMAN_P2P_IDENTITY_STORAGE="${TOOLMAN_P2P_IDENTITY_STORAGE:-file}"
export COMMUNITY_HUB_REQUIRE_REVIEW="${COMMUNITY_HUB_REQUIRE_REVIEW:-true}"
export COMMUNITY_HUB_DEV_TEST_ROLES="${COMMUNITY_HUB_DEV_TEST_ROLES:-true}"
export COMMUNITY_HUB_ALLOW_HEADER_AUTH="${COMMUNITY_HUB_ALLOW_HEADER_AUTH:-1}"

mkdir -p "$TOOLMAN_COMMUNITY_DATA_DIR"
