#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const files = execSync(
  `rg -l "error instanceof Error \\? error\\.message" apps/desktop/src/main --glob "*.ts"`,
  { encoding: 'utf8', cwd: process.cwd() },
)
  .trim()
  .split('\n')
  .filter(Boolean)

const PATTERN =
  /error instanceof Error \? error\.message : (String\(error\)|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*")/g

function ensureToErrorMessageImport(content) {
  if (!content.includes('toErrorMessage(')) return content
  if (/import\s*\{[^}]*\btoErrorMessage\b[^}]*\}\s*from\s*'@toolman\/shared'/.test(content)) {
    return content
  }

  const typeImport = content.match(/^import type \{[\s\S]*?\} from '@toolman\/shared'/m)
  if (typeImport) {
    const insertAt = content.indexOf(typeImport[0]) + typeImport[0].length
    return `${content.slice(0, insertAt)}\nimport { toErrorMessage } from '@toolman/shared'${content.slice(insertAt)}`
  }

  const valueImport = content.match(/^import \{([^}]+)\} from '@toolman\/shared'/m)
  if (valueImport) {
    const names = valueImport[1]
    if (!/\btoErrorMessage\b/.test(names)) {
      return content.replace(
        valueImport[0],
        `import {${names.trim()}, toErrorMessage } from '@toolman/shared'`,
      )
    }
    return content
  }

  const firstImport = content.match(/^import .+$/m)
  if (!firstImport) {
    return `import { toErrorMessage } from '@toolman/shared'\n${content}`
  }
  const insertAt = content.indexOf(firstImport[0]) + firstImport[0].length
  return `${content.slice(0, insertAt)}\nimport { toErrorMessage } from '@toolman/shared'${content.slice(insertAt)}`
}

for (const file of files) {
  let content = readFileSync(file, 'utf8')
  if (!PATTERN.test(content)) continue
  PATTERN.lastIndex = 0

  content = content.replace(PATTERN, 'toErrorMessage(error, $1)')
  content = ensureToErrorMessageImport(content)

  if (file.endsWith('p2p-sync.service.ts')) {
    content = content.replace(
      /\nfunction toErrorMessage\(error: unknown, fallback: string\): string \{\n {2}return error instanceof Error \? error\.message : fallback\n\}\n/,
      '\n',
    )
  }

  writeFileSync(file, content)
  console.log('updated', file)
}
