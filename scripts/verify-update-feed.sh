#!/usr/bin/env bash
# Verify remote OTA feed responds with manifest.json and electron-updater metadata.
set -euo pipefail

FEED_BASE_URL="${1:-${TOOLMAN_UPDATE_FEED_URL:-https://releases.toolman.app}}"
CHANNEL="${2:-${TOOLMAN_UPDATE_CHANNEL:-staging}}"
PLATFORM="${3:-darwin}"
ARCH="${4:-arm64}"

BASE="${FEED_BASE_URL%/}"
MANIFEST_URL="$BASE/$CHANNEL/manifest.json"

case "$PLATFORM" in
  darwin) UPDATER_FILE="latest-mac.yml" ;;
  *) UPDATER_FILE="latest.yml" ;;
esac
UPDATER_URL="$BASE/$CHANNEL/$PLATFORM/$ARCH/$UPDATER_FILE"

step() {
  printf '==> %s\n' "$1"
}

fetch() {
  local url="$1"
  curl -fsSL "$url"
}

step "Fetch manifest: $MANIFEST_URL"
MANIFEST_JSON="$(fetch "$MANIFEST_URL")"
node -e "
  const manifest = JSON.parse(process.argv[1]);
  const required = ['version', 'url', 'sha256'];
  for (const key of required) {
    if (!manifest[key]) throw new Error('manifest missing ' + key);
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error('manifest sha256 invalid');
  }
  console.log(JSON.stringify({ version: manifest.version, url: manifest.url }, null, 2));
" "$MANIFEST_JSON"

step "Fetch electron-updater metadata: $UPDATER_URL"
UPDATER_BODY="$(fetch "$UPDATER_URL")"
if ! grep -q '^version:' <<<"$UPDATER_BODY"; then
  echo "updater metadata missing version field" >&2
  exit 1
fi

printf 'OTA feed OK: channel=%s platform=%s arch=%s\n' "$CHANNEL" "$PLATFORM" "$ARCH"
