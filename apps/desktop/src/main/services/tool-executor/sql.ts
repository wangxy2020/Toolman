import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import Database from 'better-sqlite3'
import type { ToolExecutionContext } from './types'
import { sandboxFor } from './types'

function openSqliteDatabase(databasePath: string, context: ToolExecutionContext) {
  const sandbox = sandboxFor(context)
  const resolved = isAbsolute(databasePath)
    ? sandbox.resolveInside(databasePath)
    : sandbox.resolveInside(databasePath)

  if (!existsSync(resolved)) {
    throw new Error(`数据库文件不存在: ${resolved}`)
  }

  return new Database(resolved, { readonly: true, fileMustExist: true })
}

export function executeSqlListTables(args: Record<string, unknown>, context: ToolExecutionContext) {
  const database = String(args.database ?? '')
  if (!database) throw new Error('缺少 database')

  const db = openSqliteDatabase(database, context)
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
    return rows.map((row) => row.name).join('\n') || '数据库中没有用户表'
  } finally {
    db.close()
  }
}

export function executeSqlQuery(args: Record<string, unknown>, context: ToolExecutionContext) {
  const database = String(args.database ?? '')
  const sql = String(args.sql ?? '').trim()
  if (!database || !sql) throw new Error('缺少 database 或 sql')

  const db = openSqliteDatabase(database, context)
  try {
    const stmt = db.prepare(sql)
    if (stmt.reader) {
      return JSON.stringify(stmt.all(), null, 2)
    }
    const result = stmt.run()
    return JSON.stringify({
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    })
  } finally {
    db.close()
  }
}

export function discoverLocalSqliteFiles(context: ToolExecutionContext): string[] {
  const sandbox = sandboxFor(context)
  const results: string[] = []

  const scan = (dir: string, depth: number) => {
    if (depth > 3 || results.length >= 20) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= 20) break
      if (sandbox.shouldSkipEntry(entry.name)) continue
      if (!sandbox.isSafeDirectoryEntry(dir, entry.name)) continue

      const fullPath = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          scan(realpathSync.native(fullPath), depth + 1)
          continue
        }
        if (/\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
          results.push(fullPath)
        }
      } catch {
        // skip
      }
    }
  }

  scan(sandbox.rootReal, 0)
  return results
}

export function getDefaultSqliteHint(context: ToolExecutionContext): string {
  const files = discoverLocalSqliteFiles(context)
  if (files.length === 0) {
    return `工作目录 ${sandboxFor(context).rootReal} 下未发现 .db/.sqlite 文件`
  }
  return files.map((file) => `- ${file}`).join('\n')
}
