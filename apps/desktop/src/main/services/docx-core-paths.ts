import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BIN_NAME = process.platform === 'win32' ? 'toolman-docx-core.exe' : 'toolman-docx-core'

export function resolveDocxCoreBinaryPath(): string | null {
  const candidates = [
    ...(process.resourcesPath ? [join(process.resourcesPath, 'bin', BIN_NAME)] : []),
    join(__dirname, '..', '..', '..', '..', 'bin', BIN_NAME),
    join(process.cwd(), 'apps', 'desktop', 'bin', BIN_NAME),
    join(process.cwd(), 'bin', BIN_NAME),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
