import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export function resolveDbPackageRoot(): string {
  const candidates = [
    join(app.getAppPath(), 'node_modules', '@toolman', 'db'),
    join(process.resourcesPath, 'app.asar', 'node_modules', '@toolman', 'db'),
    join(process.cwd(), 'packages', 'db'),
    join(process.cwd(), '..', '..', 'packages', 'db'),
    join(app.getAppPath(), '..', '..', 'packages', 'db'),
  ]

  for (const candidate of candidates) {
    const journal = join(candidate, 'migrations', 'meta', '_journal.json')
    if (existsSync(journal)) return candidate
  }

  throw new Error('Could not locate @toolman/db migrations folder')
}
