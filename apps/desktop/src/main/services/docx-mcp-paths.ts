import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ENTRY_FILE = 'docxServer.js'

export function resolveDocxMcpServerEntryPath(): string | null {
  const candidates = [
    ...(process.resourcesPath
      ? [join(process.resourcesPath, 'mcp-docx', 'dist', ENTRY_FILE)]
      : []),
    join(__dirname, '..', '..', '..', '..', '..', 'mcp-servers', 'docx', 'dist', ENTRY_FILE),
    join(process.cwd(), 'mcp-servers', 'docx', 'dist', ENTRY_FILE),
    join(process.cwd(), '..', '..', 'mcp-servers', 'docx', 'dist', ENTRY_FILE),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
