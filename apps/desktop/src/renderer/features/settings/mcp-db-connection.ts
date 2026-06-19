import type { McpServerConfig } from '@toolman/shared'
import { LOCAL_DB_MCP_SERVER_ID } from '@toolman/shared'

export const POSTGRES_MCP_PACKAGE = '@modelcontextprotocol/server-postgres'

export const DEFAULT_POSTGRES_CONNECTION = {
  dbHost: 'localhost',
  dbPort: '5432',
  dbUser: 'postgres',
  dbPassword: '',
  dbName: 'postgres',
}

export function isPostgresMcpServer(config: McpServerConfig): boolean {
  return (config.args ?? []).some((arg) => arg.includes('server-postgres'))
}

export function parsePostgresUrl(url: string): Partial<typeof DEFAULT_POSTGRES_CONNECTION> | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return null
    return {
      dbHost: parsed.hostname || 'localhost',
      dbPort: parsed.port || '5432',
      dbUser: decodeURIComponent(parsed.username || 'postgres'),
      dbPassword: decodeURIComponent(parsed.password || ''),
      dbName: parsed.pathname.replace(/^\//, '') || 'postgres',
    }
  } catch {
    return null
  }
}

export function resolveDbConnection(config: McpServerConfig) {
  if (config.dbHost || config.dbUser || config.dbName) {
    return {
      dbHost: config.dbHost ?? DEFAULT_POSTGRES_CONNECTION.dbHost,
      dbPort: config.dbPort ?? DEFAULT_POSTGRES_CONNECTION.dbPort,
      dbUser: config.dbUser ?? DEFAULT_POSTGRES_CONNECTION.dbUser,
      dbPassword: config.dbPassword ?? DEFAULT_POSTGRES_CONNECTION.dbPassword,
      dbName: config.dbName ?? DEFAULT_POSTGRES_CONNECTION.dbName,
    }
  }

  const urlArg = (config.args ?? []).find(
    (arg) => arg.startsWith('postgres://') || arg.startsWith('postgresql://'),
  )
  if (urlArg) {
    const parsed = parsePostgresUrl(urlArg)
    if (parsed) {
      return { ...DEFAULT_POSTGRES_CONNECTION, ...parsed }
    }
  }

  return { ...DEFAULT_POSTGRES_CONNECTION }
}

export function buildPostgresArgs(config: McpServerConfig): string[] {
  const db = resolveDbConnection(config)
  const user = encodeURIComponent(db.dbUser)
  const password = encodeURIComponent(db.dbPassword)
  const auth = db.dbPassword ? `${user}:${password}` : user
  const url = `postgres://${auth}@${db.dbHost}:${db.dbPort}/${db.dbName}`
  return ['-y', POSTGRES_MCP_PACKAGE, url]
}

export function withPostgresDefaults(config: McpServerConfig): McpServerConfig {
  if (config.type === 'builtin') return config

  const db = resolveDbConnection(config)
  const usePostgres =
    config.id === LOCAL_DB_MCP_SERVER_ID ||
    isPostgresMcpServer(config) ||
    Boolean(config.dbHost || config.dbUser || config.dbName || config.dbPassword)

  return {
    ...config,
    ...db,
    command: config.command?.trim() || 'npx',
    packageSource: config.packageSource ?? 'default',
    longRunning: config.longRunning ?? false,
    timeoutSeconds: config.timeoutSeconds ?? 60,
    args: usePostgres ? buildPostgresArgs({ ...config, ...db }) : config.args,
  }
}

export function normalizeTransportType(type: McpServerConfig['type']): 'stdio' | 'sse' | 'streamableHttp' {
  if (type === 'sse' || type === 'streamableHttp') return type
  return 'stdio'
}
