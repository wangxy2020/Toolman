import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ENTRY_FILE = 'excelServer.js'

export function resolveExcelMcpServerEntryPath(): string | null {
  const candidates = [
    ...(process.resourcesPath
      ? [join(process.resourcesPath, 'mcp-excel', 'dist', ENTRY_FILE)]
      : []),
    join(__dirname, '..', '..', '..', '..', '..', 'mcp-servers', 'excel', 'dist', ENTRY_FILE),
    join(process.cwd(), 'mcp-servers', 'excel', 'dist', ENTRY_FILE),
    join(process.cwd(), '..', '..', 'mcp-servers', 'excel', 'dist', ENTRY_FILE),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
