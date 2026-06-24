#!/usr/bin/env bash
# Build RC1 internal dogfood desktop package (staging channel).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export TOOLMAN_UPDATE_CHANNEL=staging
export TOOLMAN_RELEASE_NOTES="${TOOLMAN_RELEASE_NOTES:-RC1 internal dogfood build}"

exec bash "$ROOT_DIR/scripts/build-desktop-release.sh"
