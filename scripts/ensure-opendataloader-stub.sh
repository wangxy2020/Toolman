#!/usr/bin/env bash
# Create a minimal @opendataloader/pdf package so pnpm install can resolve the
# file: vendor dependency without cloning Java/Maven sources (CI / Vercel).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUB="$ROOT/vendor/open-data-loader-pdf/node/opendataloader-pdf"

if [[ -f "$STUB/package.json" ]]; then
  echo "[odl-stub] $STUB already present"
  exit 0
fi

mkdir -p "$STUB/dist" "$STUB/lib"
cat > "$STUB/package.json" <<'EOF'
{
  "name": "@opendataloader/pdf",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": ">=20.19.0" },
  "main": "./dist/index.js",
  "bin": { "opendataloader-pdf": "./dist/cli.js" },
  "dependencies": { "commander": "^14.0.3" }
}
EOF
printf '%s\n' '#!/usr/bin/env node' 'console.error("opendataloader-pdf stub: vendor not built"); process.exit(1)' > "$STUB/dist/cli.js"
printf '%s\n' 'export function convert() { throw new Error("opendataloader-pdf stub: vendor not built"); }' > "$STUB/dist/index.js"
echo "[odl-stub] wrote $STUB"
