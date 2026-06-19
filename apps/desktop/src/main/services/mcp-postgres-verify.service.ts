import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { LOCAL_DB_MCP_SERVER_ID, type McpServerConfig } from '@toolman/shared'

const VERIFY_QUERY = 'SELECT 1 AS ok'

export function isPostgresMcpConfig(config: McpServerConfig): boolean {
  return (
    config.id === LOCAL_DB_MCP_SERVER_ID ||
    (config.args ?? []).some((arg) => arg.includes('server-postgres'))
  )
}

export function postgresMcpConfigFingerprint(config: McpServerConfig): string {
  return JSON.stringify({
    command: config.command,
    args: config.args,
    env: config.env,
    dbHost: config.dbHost,
    dbPort: config.dbPort,
    dbUser: config.dbUser,
    dbPassword: config.dbPassword,
    dbName: config.dbName,
  })
}

function extractToolError(result: unknown): string {
  const payload =
    result && typeof result === 'object'
      ? (result as { content?: Array<{ type: string; text?: string }>; isError?: boolean })
      : {}
  const chunks: string[] = []
  for (const block of payload.content ?? []) {
    if (block.type === 'text' && block.text) chunks.push(block.text)
  }
  const text = chunks.join('\n').trim()
  if (!text) return '数据库连接失败'
  return text.replace(/^Error:\s*/i, '').trim() || '数据库连接失败'
}

export async function verifyPostgresMcpDatabase(
  client: Client,
  config: McpServerConfig,
): Promise<void> {
  const timeoutMs = (config.timeoutSeconds ?? 15) * 1000

  const verifyPromise = client.callTool({
    name: 'query',
    arguments: { sql: VERIFY_QUERY },
  })

  const result = await new Promise<Awaited<ReturnType<typeof client.callTool>>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('数据库连接验证超时')), timeoutMs)
    verifyPromise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })

  if (result.isError) {
    throw new Error(extractToolError(result))
  }
}
