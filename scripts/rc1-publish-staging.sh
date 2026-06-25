#!/usr/bin/env bash
# RC1 Phase 0.5: build + publish staging OTA (requires CDN credentials).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FEED_BASE="${TOOLMAN_UPDATE_FEED_URL:-https://releases.toolman.app}"
CHANNEL="${TOOLMAN_UPDATE_CHANNEL:-staging}"
PLATFORM="${TOOLMAN_UPDATE_PLATFORM:-darwin}"
ARCH="${TOOLMAN_UPDATE_ARCH:-arm64}"

missing=()
for var in TOOLMAN_UPDATE_S3_BUCKET TOOLMAN_UPDATE_AWS_ACCESS_KEY_ID TOOLMAN_UPDATE_AWS_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  cat >&2 <<EOF
error: missing CDN credentials for staging publish:

$(printf '  - %s\n' "${missing[@]}")

Set credentials (see docs/engineering/OTA_RELEASE.md), then re-run:

  export TOOLMAN_UPDATE_S3_BUCKET=...
  export TOOLMAN_UPDATE_AWS_ACCESS_KEY_ID=...
  export TOOLMAN_UPDATE_AWS_SECRET_ACCESS_KEY=...
  # optional: TOOLMAN_UPDATE_S3_ENDPOINT for R2

  TOOLMAN_RELEASE_PUBLISH=1 pnpm rc1:build
  pnpm release:desktop:publish
  pnpm release:verify-feed "$FEED_BASE" "$CHANNEL" "$PLATFORM" "$ARCH"
EOF
  exit 1
fi

export TOOLMAN_UPDATE_CHANNEL="$CHANNEL"
export TOOLMAN_RELEASE_PUBLISH=1

bash "$ROOT_DIR/scripts/build-rc1-desktop.sh"
pnpm release:desktop:publish
bash "$ROOT_DIR/scripts/verify-update-feed.sh" "$FEED_BASE" "$CHANNEL" "$PLATFORM" "$ARCH"

printf '\nRC1 staging OTA publish + verify-feed OK.\n'
