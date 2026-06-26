#!/usr/bin/env node
/**
 * Generate THIRD_PARTY_NOTICES.md from production npm dependencies.
 * Run from repo root: node scripts/generate-third-party-notices.mjs
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'THIRD_PARTY_NOTICES.md')

function collectLicenses(cwd, label) {
  const raw = execSync('pnpm licenses list --json --prod', {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const data = JSON.parse(raw)
  const rows = []
  for (const [license, packages] of Object.entries(data)) {
    for (const pkg of packages) {
      rows.push({ scope: label, name: pkg.name, version: pkg.version, license })
    }
  }
  return rows
}

const rows = [
  ...collectLicenses(join(ROOT, 'apps/desktop'), 'desktop'),
  ...collectLicenses(join(ROOT, 'mcp-servers/excel'), 'mcp-excel'),
].sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope))

const unique = new Map()
for (const row of rows) {
  const key = `${row.name}@${row.version}`
  if (!unique.has(key)) unique.set(key, row)
}

const lines = [
  '# Third-Party Notices',
  '',
  'Toolman is licensed under **AGPL-3.0-or-later** (see [LICENSE](./LICENSE)).',
  'This file lists permissively licensed third-party components bundled with or used by Toolman.',
  'Each component remains under its own license; full license texts are in upstream packages.',
  '',
  '| Package | Version | License | Scope |',
  '|---------|---------|---------|-------|',
]

for (const row of unique.values()) {
  const license = row.license.replace(/\|/g, '\\|')
  lines.push(`| ${row.name} | ${row.version} | ${license} | ${row.scope} |`)
}

lines.push(
  '',
  '## Additional bundled components',
  '',
  '| Component | License | Notes |',
  '|-----------|---------|-------|',
  '| Electron / Chromium | MIT + multi | Desktop shell; Chromium credits in app runtime |',
  '| toolman-p2p (Rust) | AGPL-3.0-or-later | Native P2P module |',
  '| toolman-libp2p (Rust) | AGPL-3.0-or-later | libp2p bridge |',
  '| toolman-community-hub (Rust) | AGPL-3.0-or-later | Community sidecar |',
  '| KaTeX fonts | MIT | Bundled via katex |',
  '| highlight.js | BSD-3-Clause | Syntax themes |',
  '',
  'Regenerate this file: `pnpm licenses:generate`',
  '',
)

writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log(`Wrote ${OUT} (${unique.size} npm packages)`)
