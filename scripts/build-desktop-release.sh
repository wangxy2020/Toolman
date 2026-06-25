#!/usr/bin/env bash
# Build a signed/unsigned desktop release artifact + channel manifest.json.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"

CHANNEL="${TOOLMAN_UPDATE_CHANNEL:-staging}"
FEED_BASE_URL="${TOOLMAN_UPDATE_FEED_URL:-https://releases.toolman.app}"
NOTES="${TOOLMAN_RELEASE_NOTES:-}"
MIN_VERSION="${TOOLMAN_UPDATE_MIN_VERSION:-}"
DO_PUBLISH="${TOOLMAN_RELEASE_PUBLISH:-0}"

step() {
  printf '\n==> %s\n' "$1"
}

resolve_platform() {
  case "$(uname -s)" in
    Darwin) echo "darwin" ;;
    MINGW* | MSYS* | CYGWIN*) echo "win32" ;;
    Linux) echo "linux" ;;
    *)
      echo "unsupported platform" >&2
      exit 1
      ;;
  esac
}

resolve_arch() {
  local platform="$1"
  case "$platform" in
    darwin)
      if [[ "$(uname -m)" == "arm64" ]]; then
        echo "arm64"
      else
        echo "x64"
      fi
      ;;
    win32 | linux)
      if [[ "${PROCESSOR_ARCHITECTURE:-}" == "ARM64" ]]; then
        echo "arm64"
      else
        echo "x64"
      fi
      ;;
  esac
}

find_primary_artifact() {
  local platform="$1"
  local dist_dir="$2"
  local pattern=""
  local match=""

  case "$platform" in
    darwin) pattern="*.dmg" ;;
    win32)
      match="$(find "$dist_dir" -maxdepth 1 -type f -name '*-Setup.exe' | sort | tail -n 1 || true)"
      if [[ -n "$match" ]]; then
        printf '%s' "$match"
        return 0
      fi
      pattern="*.exe"
      ;;
    linux) pattern="*.AppImage" ;;
  esac

  match="$(find "$dist_dir" -maxdepth 1 -type f -name "$pattern" | sort | tail -n 1 || true)"
  if [[ -z "$match" ]]; then
    echo "no release artifact matching $pattern under $dist_dir" >&2
    exit 1
  fi
  printf '%s' "$match"
}

list_release_artifacts() {
  local platform="$1"
  local dist_dir="$2"
  case "$platform" in
    darwin)
      find "$dist_dir" -maxdepth 1 -type f \( -name '*.dmg' -o -name 'latest-mac.yml' -o -name '*-manifest.json' \) | sort
      ;;
    win32)
      find "$dist_dir" -maxdepth 1 -type f \( -name '*.exe' -o -name 'latest.yml' -o -name '*-manifest.json' \) | sort
      ;;
    linux)
      find "$dist_dir" -maxdepth 1 -type f \( -name '*.AppImage' -o -name 'latest-linux.yml' -o -name '*-manifest.json' \) | sort
      ;;
  esac
}

PLATFORM="$(resolve_platform)"
ARCH="$(resolve_arch "$PLATFORM")"
VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
PUBLISH_URL="${FEED_BASE_URL%/}/$CHANNEL/$PLATFORM/$ARCH"

export TOOLMAN_RELEASE_BUILD=1
export TOOLMAN_UPDATE_CHANNEL="$CHANNEL"
export TOOLMAN_UPDATE_FEED_URL="$FEED_BASE_URL"
export TOOLMAN_UPDATE_PUBLISH_URL="$PUBLISH_URL"

step "Release target: channel=$CHANNEL platform=$PLATFORM arch=$ARCH version=$VERSION"
step "Feed base: $FEED_BASE_URL"
step "electron-updater publish URL: $PUBLISH_URL"

step "Build native modules"
pnpm build:p2p
pnpm build:libp2p
pnpm build:community-hub
pnpm build:excel-mcp-server

step "Build workspace packages"
pnpm --filter @toolman/shared build
pnpm --filter @toolman/desktop^... build

step "Build desktop bundle"
pnpm --filter @toolman/desktop build

step "Package desktop app"
(
  cd "$DESKTOP_DIR"
  if [[ "$DO_PUBLISH" == "1" ]]; then
    pnpm exec electron-builder --config electron-builder.yml --publish always
  else
    pnpm exec electron-builder --config electron-builder.yml --publish never
  fi
)

ARTIFACT="$(find_primary_artifact "$PLATFORM" "$DESKTOP_DIR/dist")"
MANIFEST_OUT="$DESKTOP_DIR/dist/$CHANNEL-manifest.json"

step "Generate manifest.json"
node "$ROOT_DIR/scripts/generate-update-manifest.mjs" \
  --artifact "$ARTIFACT" \
  --version "$VERSION" \
  --channel "$CHANNEL" \
  --feed-base-url "$FEED_BASE_URL" \
  --platform "$PLATFORM" \
  --arch "$ARCH" \
  ${NOTES:+--notes "$NOTES"} \
  ${MIN_VERSION:+--min-version "$MIN_VERSION"} \
  --out "$MANIFEST_OUT"

step "Release artifacts ready"
printf '  primary (OTA/manifest): %s\n' "$ARTIFACT"
printf '  manifest: %s\n' "$MANIFEST_OUT"
printf '  updater metadata: %s\n' "$DESKTOP_DIR/dist/latest-mac.yml $DESKTOP_DIR/dist/latest.yml"
while IFS= read -r file; do
  [[ -n "$file" ]] && printf '  artifact: %s\n' "$file"
done < <(list_release_artifacts "$PLATFORM" "$DESKTOP_DIR/dist")

if [[ "$DO_PUBLISH" == "1" ]]; then
  step "Upload manifest.json to CDN prefix"
  TOOLMAN_UPDATE_CHANNEL="$CHANNEL" \
    TOOLMAN_UPDATE_FEED_URL="$FEED_BASE_URL" \
    TOOLMAN_UPDATE_PLATFORM="$PLATFORM" \
    TOOLMAN_UPDATE_ARCH="$ARCH" \
    bash "$ROOT_DIR/scripts/publish-update-feed.sh"
fi
