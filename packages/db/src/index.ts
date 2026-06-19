import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema/index.js'

export * from './schema/index.js'
export { seedDefaultData, getDefaultWorkspace, DEFAULT_LOCAL_MODEL } from './seed.js'
export * from './types/chat.js'
export * from './types/rows.js'
export * from './types/knowledge.js'
export * from './types/p2p.js'
export * from './repositories/index.js'

export type ToolmanDatabase = ReturnType<typeof createDatabase>

export function createDatabase(dbPath: string) {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema })
}

export function getSqliteClient(db: ToolmanDatabase): Database.Database {
  const session = (db as unknown as { session?: { client: Database.Database } }).session
  if (!session?.client) {
    throw new Error('SQLite client unavailable')
  }
  return session.client
}

export function runMigrations(db: ToolmanDatabase, migrationsFolder: string) {
  migrate(db, { migrationsFolder })
}

export function getMigrationsPath(packageRoot: string) {
  return join(packageRoot, 'migrations')
}

export function runInTransaction<T>(db: ToolmanDatabase, fn: (tx: ToolmanDatabase) => T): T {
  return db.transaction((tx) => fn(tx as unknown as ToolmanDatabase))
}
