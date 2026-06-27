#!/usr/bin/env bash
# Upload desktop release artifacts + manifest.json to an S3-compatible CDN prefix.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
DESKTOP_DIR="apps/desktop/dist"

CHANNEL="${TOOLMAN_UPDATE_CHANNEL:-staging}"
FEED_BASE_URL="${TOOLMAN_UPDATE_FEED_URL:-https://releases.toolman.app}"
PLATFORM="${TOOLMAN_UPDATE_PLATFORM:-darwin}"
ARCH="${TOOLMAN_UPDATE_ARCH:-arm64}"
DRY_RUN="${TOOLMAN_RELEASE_DRY_RUN:-0}"

S3_BUCKET="${TOOLMAN_UPDATE_S3_BUCKET:-}"
S3_ENDPOINT="${TOOLMAN_UPDATE_S3_ENDPOINT:-}"
S3_PREFIX="${TOOLMAN_UPDATE_S3_PREFIX:-}"

if [[ -z "$S3_BUCKET" ]]; then
  echo "error: TOOLMAN_UPDATE_S3_BUCKET is required for CDN publish" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "error: aws CLI not found (required for S3-compatible upload)" >&2
  exit 1
fi

AWS_ARGS=()
if [[ -n "$S3_ENDPOINT" ]]; then
  AWS_ARGS+=(--endpoint-url "$S3_ENDPOINT")
fi

DEST_PREFIX="$S3_PREFIX"
if [[ -n "$DEST_PREFIX" && "$DEST_PREFIX" != */ ]]; then
  DEST_PREFIX="$DEST_PREFIX/"
fi

REMOTE_BASE="s3://$S3_BUCKET/${DEST_PREFIX}${CHANNEL}/${PLATFORM}/${ARCH}"
REMOTE_MANIFEST="s3://$S3_BUCKET/${DEST_PREFIX}${CHANNEL}/manifest.json"
LOCAL_MANIFEST="$DESKTOP_DIR/$CHANNEL-manifest.json"

if [[ ! -f "$LOCAL_MANIFEST" ]]; then
  echo "error: manifest not found at $LOCAL_MANIFEST (run build-desktop-release.sh first)" >&2
  exit 1
fi

upload() {
  local source="$1"
  local destination="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] aws s3 cp %q %q\n' "$source" "$destination"
    return 0
  fi
  aws s3 cp "${AWS_ARGS[@]}" "$source" "$destination" --acl public-read
}

printf 'Publishing channel=%s platform=%s arch=%s\n' "$CHANNEL" "$PLATFORM" "$ARCH"
printf 'Feed base URL: %s\n' "$FEED_BASE_URL"

for file in "$DESKTOP_DIR"/*; do
  base="$(basename "$file")"
  case "$base" in
    *.dmg | *.zip | *.exe | *.AppImage | latest*.yml | *.blockmap)
      upload "$file" "$REMOTE_BASE/$base"
      ;;
  esac
done

upload "$LOCAL_MANIFEST" "$REMOTE_MANIFEST"

printf 'Published manifest: %s/%s/manifest.json\n' "${FEED_BASE_URL%/}" "$CHANNEL"
printf 'Published updater feed: %s/%s/%s/%s\n' "${FEED_BASE_URL%/}" "$CHANNEL" "$PLATFORM" "$ARCH"

if [[ "$DRY_RUN" != "1" ]]; then
  bash "$ROOT_DIR/scripts/verify-update-feed.sh" "$FEED_BASE_URL" "$CHANNEL" "$PLATFORM" "$ARCH"
fi
