#!/usr/bin/env bash
# Pin veraPDF to versions compatible with ChunksWriter StreamInfo API.
set -euo pipefail

VENDOR_DIR="${1:?vendor dir required}"
PARENT_POM="$VENDOR_DIR/java/pom.xml"
CORE_POM="$VENDOR_DIR/java/opendataloader-pdf-core/pom.xml"

if [[ ! -f "$PARENT_POM" || ! -f "$CORE_POM" ]]; then
  echo "[vendor:odl] ERROR: expected Java poms under $VENDOR_DIR/java" >&2
  exit 1
fi

if grep -q '\[1.31.0,1.32.0-RC)' "$PARENT_POM"; then
  perl -0pi -e 's|<verapdf\.version>\[1\.31\.0,1\.32\.0-RC\)</verapdf\.version>|<verapdf.version>1.31.95</verapdf.version>\n        <verapdf.wcag.algs.version>1.31.30</verapdf.wcag.algs.version>|' "$PARENT_POM"
fi

if ! grep -q 'artifactId>wcag-algorithms<' "$CORE_POM"; then
  perl -0pi -e 's|</dependency>\n        <dependency>\n            <groupId>com\.squareup\.okhttp3</groupId>|</dependency>\n        <dependency>\n            <groupId>org.verapdf</groupId>\n            <artifactId>wcag-algorithms</artifactId>\n            <version>\${verapdf.wcag.algs.version}</version>\n            <exclusions>\n                <exclusion>\n                    <groupId>org.jacoco</groupId>\n                    <artifactId>jacoco-maven-plugin</artifactId>\n                </exclusion>\n            </exclusions>\n        </dependency>\n        <dependency>\n            <groupId>com.squareup.okhttp3</groupId>|' "$CORE_POM"
fi

if ! grep -q 'verapdf.wcag.algs.version' "$PARENT_POM" || ! grep -q 'artifactId>wcag-algorithms<' "$CORE_POM"; then
  echo "[vendor:odl] ERROR: failed to pin veraPDF versions" >&2
  exit 1
fi

echo "[vendor:odl] Pinned veraPDF to 1.31.95 / wcag-algorithms 1.31.30"
