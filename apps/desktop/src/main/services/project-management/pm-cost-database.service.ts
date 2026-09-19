import { Client } from 'pg'
import mysql from 'mysql2/promise'

import {
  COST_DATABASE_FIELD_KEYS,
  fieldKeysForCostDatabaseView,
  defaultCostDatabasePort,
  isAllowedLocalDatabaseHost,
  parseCostDatabaseImportedRows,
  parseCostDatabaseNumber,
  parseCostDatabaseText,
  PmCostDatabaseGetSyncedInputSchema,
  PmCostDatabaseInspectInputSchema,
  PmCostDatabaseQueryInputSchema,
  resolveCostDatabaseColumnMap,
  resolveCostDatabaseProjectFilterColumns,
  resolveProjectIdColumn,
  matchCostDatabaseTableName,
  type CostDatabaseDriver,
  type CostDatabaseImportedRow,
  type PmCostDatabaseInspectResult,
} from '@toolman/shared'
import { getSqliteClient } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'

const ROW_LIMIT = 5000
const IDENT_MAX = 128
const CONNECT_TIMEOUT_MS = 8000

type SqlClient = {
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>
  end: () => Promise<void>
}

function assertSqlIdent(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > IDENT_MAX || trimmed.includes('\0')) {
    throw new Error('表名或列名不合法')
  }
  return trimmed
}

function quoteIdent(driver: CostDatabaseDriver, name: string): string {
  const ident = assertSqlIdent(name)
  return driver === 'mysql' ? `\`${ident.replace(/`/g, '``')}\`` : `"${ident.replace(/"/g, '""')}"`
}

function parseTableRef(
  driver: CostDatabaseDriver,
  schema: string | undefined,
  tableName: string,
  database: string,
): { schema: string; table: string } {
  const trimmed = tableName.trim()
  const schemaTrim = schema?.trim() ?? ''
  if (trimmed.includes('.')) {
    const index = trimmed.indexOf('.')
    return { schema: assertSqlIdent(trimmed.slice(0, index)), table: assertSqlIdent(trimmed.slice(index + 1)) }
  }
  if (schemaTrim) return { schema: assertSqlIdent(schemaTrim), table: assertSqlIdent(trimmed) }
  if (driver === 'postgres') return { schema: 'public', table: assertSqlIdent(trimmed) }
  return { schema: assertSqlIdent(database), table: assertSqlIdent(trimmed) }
}

function qualifyTable(driver: CostDatabaseDriver, schema: string, table: string): string {
  return schema ? `${quoteIdent(driver, schema)}.${quoteIdent(driver, table)}` : quoteIdent(driver, table)
}

async function resolveQueryTable(
  client: SqlClient,
  driver: CostDatabaseDriver,
  schema: string | undefined,
  tableName: string | undefined,
  database: string,
  tables: string[],
): Promise<{ ref: { schema: string; table: string }; columns: string[]; projectIdColumn: string | null }> {
  const preferred = tableName?.trim()
  const matched = preferred ? matchCostDatabaseTableName(tables, preferred) : ''
  const candidates = matched
    ? [matched, ...tables.filter((table) => table !== matched)]
    : preferred
      ? [preferred, ...tables.filter((table) => table !== preferred)]
      : tables
  for (const candidate of candidates) {
    const ref = parseTableRef(driver, schema, candidate, database)
    const columns = await listTableColumns(client, driver, ref.schema, ref.table)
    if (columns.length === 0) continue
    const projectIdColumn = resolveProjectIdColumn(columns)
    if (preferred && (candidate === preferred || candidate === matched)) {
      return { ref, columns, projectIdColumn }
    }
    if (projectIdColumn) return { ref, columns, projectIdColumn }
    if (!preferred) return { ref, columns, projectIdColumn }
  }
  if (preferred) {
    throw new Error(`找不到表「${preferred}」`)
  }
  throw new Error('未找到可读取的数据表')
}

function assertLocalHost(host: string): string {
  const trimmed = host.trim()
  if (!isAllowedLocalDatabaseHost(trimmed)) {
    throw new Error('仅支持连接本机或局域网数据库')
  }
  return trimmed
}

function resolvePort(driver: CostDatabaseDriver, port: number | undefined): number {
  return port ?? defaultCostDatabasePort(driver)
}

async function openClient(input: {
  driver: CostDatabaseDriver
  host: string
  port?: number
  user?: string
  password?: string
  database: string
}): Promise<SqlClient> {
  const host = assertLocalHost(input.host)
  const port = resolvePort(input.driver, input.port)
  const user = input.user?.trim() ?? ''
  const password = input.password ?? ''
  const database = input.database.trim()

  if (input.driver === 'mysql') {
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: CONNECT_TIMEOUT_MS,
    })
    return {
      async query(sql, params = []) {
        const [rows] = await connection.query(sql, params)
        return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
      },
      async end() {
        await connection.end()
      },
    }
  }

  const client = new Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    ssl: false,
  })
  await client.connect()
  return {
    async query(sql, params = []) {
      const result = await client.query(sql, params)
      return result.rows as Array<Record<string, unknown>>
    },
    async end() {
      await client.end()
    },
  }
}

async function listUserTables(client: SqlClient, driver: CostDatabaseDriver): Promise<string[]> {
  if (driver === 'mysql') {
    const rows = await client.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`,
    )
    return rows.map((row) => parseCostDatabaseText(row.name)).filter(Boolean)
  }
  const rows = await client.query(
    `SELECT table_schema AS schema, table_name AS name
     FROM information_schema.tables
     WHERE table_type IN ('BASE TABLE', 'VIEW')
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY table_schema, table_name`,
  )
  return rows
    .map((row) => {
      const schema = parseCostDatabaseText(row.schema)
      const name = parseCostDatabaseText(row.name)
      if (!schema || !name) return ''
      return `${schema}.${name}`
    })
    .filter(Boolean)
}

async function listTableColumns(
  client: SqlClient,
  driver: CostDatabaseDriver,
  schema: string,
  table: string,
): Promise<string[]> {
  if (driver === 'mysql') {
    const rows = await client.query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schema, table],
    )
    return rows.map((row) => parseCostDatabaseText(row.name)).filter(Boolean)
  }
  const rows = await client.query(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows.map((row) => parseCostDatabaseText(row.name)).filter(Boolean)
}

function mapImportedRow(raw: Record<string, unknown>): CostDatabaseImportedRow {
  return {
    code: parseCostDatabaseText(raw.code),
    name: parseCostDatabaseText(raw.name),
    featureDescription: parseCostDatabaseText(raw.featureDescription),
    unit: parseCostDatabaseText(raw.unit),
    quantity: parseCostDatabaseNumber(raw.quantity),
    periodQuantity: parseCostDatabaseNumber(raw.periodQuantity),
    priorQuantity: parseCostDatabaseNumber(raw.priorQuantity),
    unitPrice: parseCostDatabaseNumber(raw.unitPrice),
    sectionalWork: parseCostDatabaseText(raw.sectionalWork),
    subproject: parseCostDatabaseText(raw.subproject),
    type: parseCostDatabaseText(raw.type),
    note: parseCostDatabaseText(raw.note),
    currency: parseCostDatabaseText(raw.currency),
    billingPeriod: parseCostDatabaseText(raw.billingPeriod),
    priceAdjustment: parseCostDatabaseNumber(raw.priceAdjustment),
    priceCorrection: parseCostDatabaseNumber(raw.priceCorrection),
    applicationDate: parseCostDatabaseText(raw.applicationDate),
    effectiveDate: parseCostDatabaseText(raw.effectiveDate),
    actualPaymentDate1: parseCostDatabaseText(raw.actualPaymentDate1),
    actualPaymentDate2: parseCostDatabaseText(raw.actualPaymentDate2),
    periodClaimAmount: parseCostDatabaseNumber(raw.periodClaimAmount),
    payableAmount: parseCostDatabaseNumber(raw.payableAmount),
  }
}

function parseCount(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw)
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

async function countTableRows(
  client: SqlClient,
  driver: CostDatabaseDriver,
  schema: string,
  table: string,
): Promise<number> {
  const sql = `SELECT COUNT(*) AS n FROM ${qualifyTable(driver, schema, table)}`
  const rows = await client.query(sql)
  const first = rows[0] ?? {}
  return parseCount(first.n ?? first.N ?? first.count ?? first.COUNT)
}

function quoteTextExpr(driver: CostDatabaseDriver, column: string): string {
  const ident = quoteIdent(driver, column)
  return driver === 'mysql' ? `LOWER(TRIM(${ident}))` : `LOWER(BTRIM(CAST(${ident} AS TEXT)))`
}

function buildIdentifierFilter(
  driver: CostDatabaseDriver,
  columns: readonly string[],
  identifier: string,
): { expr: string; values: unknown[] } | null {
  const value = identifier.trim()
  if (!value || columns.length === 0) return null
  const clauses = columns.map((column) => `${quoteTextExpr(driver, column)} = ?`)
  return { expr: `(${clauses.join(' OR ')})`, values: columns.map(() => value.toLowerCase()) }
}

function compileWhere(
  driver: CostDatabaseDriver,
  parts: Array<{ expr: string; values: unknown[] }>,
): { sql: string; values: unknown[] } {
  const values: unknown[] = []
  const sqls = parts.map((part) => {
    let expr = part.expr
    if (driver === 'postgres') {
      for (const value of part.values) {
        values.push(value)
        expr = expr.replace('?', `$${values.length}`)
      }
      return expr
    }
    values.push(...part.values)
    return expr
  })
  return { sql: sqls.join(' AND '), values }
}

function ensureSyncedCatalogTable(): ReturnType<typeof getSqliteClient> {
  const sqlite = getSqliteClient(getDatabase())
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pm_cost_database_catalog (
      workspace_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      synced_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, scope_id)
    )
  `)
  return sqlite
}

function persistSyncedCatalog(
  workspaceId: string,
  scopeId: string,
  rows: CostDatabaseImportedRow[],
): void {
  const sqlite = ensureSyncedCatalogTable()
  sqlite
    .prepare(
      `INSERT INTO pm_cost_database_catalog (workspace_id, scope_id, rows_json, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id, scope_id) DO UPDATE SET
         rows_json = excluded.rows_json,
         synced_at = excluded.synced_at`,
    )
    .run(workspaceId, scopeId, JSON.stringify(rows), Date.now())
}

export function getSyncedCostDatabaseIpc(rawInput: unknown): { rows: CostDatabaseImportedRow[] } {
  const input = PmCostDatabaseGetSyncedInputSchema.parse(rawInput)
  const sqlite = ensureSyncedCatalogTable()
  const row = sqlite
    .prepare(
      `SELECT rows_json AS rowsJson FROM pm_cost_database_catalog
       WHERE workspace_id = ? AND scope_id = ?`,
    )
    .get(input.workspaceId, input.scopeId) as { rowsJson?: string } | undefined
  const parsed = parseCostDatabaseImportedRows(row?.rowsJson ? JSON.parse(row.rowsJson) : [])
  return { rows: parsed ?? [] }
}

export async function inspectCostDatabaseIpc(rawInput: unknown): Promise<PmCostDatabaseInspectResult> {
  const input = PmCostDatabaseInspectInputSchema.parse(rawInput)
  const client = await openClient(input)
  try {
    const tables = await listUserTables(client, input.driver)
    const tableColumns: Record<string, string[]> = {}
    let columnCount = 0
    let rowCount = 0
    for (const table of tables) {
      const ref = parseTableRef(input.driver, input.schema, table, input.database)
      const columns = await listTableColumns(client, input.driver, ref.schema, ref.table)
      tableColumns[table] = columns
      columnCount += columns.length
      try {
        rowCount += await countTableRows(client, input.driver, ref.schema, ref.table)
      } catch {
        // Views or permission-limited tables may fail COUNT; still report columns.
      }
    }
    const preferred = input.tableName?.trim()
    const columns = preferred && tableColumns[preferred] ? tableColumns[preferred] : (tableColumns[tables[0] ?? ''] ?? [])
    return {
      tables,
      columns,
      tableCount: tables.length,
      columnCount,
      rowCount,
      tableColumns,
    }
  } finally {
    await client.end()
  }
}

export async function queryCostDatabaseIpc(
  rawInput: unknown,
): Promise<{ rows: CostDatabaseImportedRow[] }> {
  const input = PmCostDatabaseQueryInputSchema.parse(rawInput)
  const client = await openClient(input)
  try {
    const tables = await listUserTables(client, input.driver)
    const resolved = await resolveQueryTable(
      client,
      input.driver,
      input.schema,
      input.tableName,
      input.database,
      tables,
    )
    const { ref, columns } = resolved
    const fieldKeys = input.viewKey
      ? fieldKeysForCostDatabaseView(input.viewKey)
      : COST_DATABASE_FIELD_KEYS
    const columnMap = resolveCostDatabaseColumnMap(input.columnMap, columns, fieldKeys)
    const selected = fieldKeys.filter((key) => columnMap[key])
    if (selected.length === 0) {
      throw new Error('请至少映射一列，或使用能自动识别的列名')
    }
    const selectSql = selected
      .map((key) => `${quoteIdent(input.driver, columnMap[key]!)} AS ${quoteIdent(input.driver, key)}`)
      .join(', ')
    const identifier = input.projectId.trim()
    const identifierColumns = resolveCostDatabaseProjectFilterColumns(columns)
    const whereParts: Array<{ expr: string; values: unknown[] }> = []
    const identifierFilter = buildIdentifierFilter(input.driver, identifierColumns, identifier)
    if (identifierFilter) whereParts.push(identifierFilter)
    const where =
      whereParts.length > 0 ? compileWhere(input.driver, whereParts) : { sql: '1=1', values: [] }
    const sql = `SELECT ${selectSql} FROM ${qualifyTable(input.driver, ref.schema, ref.table)} WHERE ${where.sql} LIMIT ${ROW_LIMIT}`
    const rawRows = await client.query(sql, where.values)
    const rows = rawRows.map((row) => {
      const mapped = mapImportedRow(row)
      return input.viewKey ? { ...mapped, type: input.viewKey } : mapped
    })
    if (input.workspaceId && input.scopeId) {
      persistSyncedCatalog(input.workspaceId, input.scopeId, rows)
    }
    return { rows }
  } finally {
    await client.end()
  }
}
