import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Resolve a worker bundle emitted next to the compiled main process output. */
export function resolveMainWorkerScript(fileName: string): string | null {
  const candidates = [
    join(__dirname, 'workers', fileName),
    join(__dirname, '../workers', fileName),
    join(process.cwd(), 'out/main/workers', fileName),
    join(process.cwd(), 'apps/desktop/out/main/workers', fileName),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}
