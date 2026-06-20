import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_FILE_NAMES = ['.env', '.env.local'] as const

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

function applyEnvFile(filePath: string): void {
  const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function collectEnvSearchRoots(): string[] {
  const roots = new Set<string>([
    process.cwd(),
    join(process.cwd(), '../..'),
    join(__dirname, '../..'),
    join(__dirname, '../../..'),
    join(__dirname, '../../../..'),
  ])

  return [...roots]
}

export function loadWorkspaceEnvFiles(): void {
  const visited = new Set<string>()

  for (const root of collectEnvSearchRoots()) {
    for (const fileName of ENV_FILE_NAMES) {
      const filePath = join(root, fileName)
      if (visited.has(filePath) || !existsSync(filePath)) continue
      visited.add(filePath)
      applyEnvFile(filePath)
    }
  }
}
