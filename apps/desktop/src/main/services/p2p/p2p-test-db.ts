import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createDatabase,
  getMigrationsPath,
  identities,
  runMigrations,
  seedDefaultData,
  type ToolmanDatabase,
} from '@toolman/db'

export interface P2pTestDb {
  db: ToolmanDatabase
  cleanup: () => void
}

export function createP2pTestDb(): P2pTestDb {
  const tempDir = mkdtempSync(join(tmpdir(), 'toolman-p2p-integration-'))
  const dbPath = join(tempDir, 'test.db')
  const db = createDatabase(dbPath)
  const packageRoot = join(process.cwd(), '..', '..', 'packages', 'db')

  runMigrations(db, getMigrationsPath(packageRoot))
  seedDefaultData(db)

  return {
    db,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

export function insertTestIdentity(db: ToolmanDatabase, id: string, displayName: string): void {
  const now = new Date()
  db.insert(identities)
    .values({
      id,
      type: 'local',
      displayName,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}
