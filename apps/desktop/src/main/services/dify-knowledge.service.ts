import { parseEnvironmentVariables } from './permission.service'
import { getMcpServer } from './mcp-server-config.service'

interface DifyConfig {
  apiKey: string
  apiHost: string
}

function resolveDifyConfig(contextEnv?: string): DifyConfig {
  const server = getMcpServer('dify')
  const env = {
    ...process.env,
    ...parseEnvironmentVariables(contextEnv),
    ...(server?.env ?? {}),
  }

  const apiKey = (env.DIFY_KEY ?? env.DIFY_API_KEY ?? '').trim()
  if (!apiKey) {
    throw new Error('未配置 DIFY_KEY，请在 MCP 服务器设置或智能体环境变量中添加')
  }

  const apiHost = (server?.providerUrl ?? env.DIFY_API_HOST ?? 'https://api.dify.ai/v1').replace(/\/$/, '')
  return { apiKey, apiHost }
}

interface DifyDataset {
  id: string
  name: string
  description?: string
}

export async function difyListKnowledges(contextEnv?: string): Promise<string> {
  const { apiKey, apiHost } = resolveDifyConfig(contextEnv)
  const response = await fetch(`${apiHost}/datasets`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw new Error(`Dify API ${response.status}: ${await response.text()}`)
  }

  const payload = (await response.json()) as { data?: DifyDataset[] }
  const items = payload.data ?? []

  if (items.length === 0) return '### 可用知识库\n\n- 未找到知识库'

  const list = items
    .map((item) => `- **${item.name}** (ID: ${item.id})\n  ${item.description || '无描述'}`)
    .join('\n')

  return `### 可用知识库\n\n${list}`
}

export async function difySearchKnowledge(
  args: Record<string, unknown>,
  contextEnv?: string,
): Promise<string> {
  const { apiKey, apiHost } = resolveDifyConfig(contextEnv)
  const id = String(args.id ?? '').trim()
  const query = String(args.query ?? '').trim()
  const topK = Math.min(Math.max(Number(args.topK) || 6, 1), 20)

  if (!id) throw new Error('缺少 id（知识库 ID）')
  if (!query) throw new Error('缺少 query')

  const response = await fetch(`${apiHost}/datasets/${id}/retrieve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      retrieval_model: {
        top_k: topK,
        search_method: 'semantic_search',
        reranking_enable: false,
        score_threshold_enabled: false,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Dify API ${response.status}: ${await response.text()}`)
  }

  const payload = (await response.json()) as {
    records?: Array<{
      score: number
      segment: {
        content: string
        keywords?: string[]
        document?: { name?: string }
      }
    }>
  }

  const records = payload.records ?? []
  if (records.length === 0) {
    return `### 查询: ${query}\n\n未找到结果。`
  }

  const body = records
    .map((record, index) => {
      const docName = record.segment.document?.name ?? '未知文档'
      const keywords = record.segment.keywords?.length
        ? `\n*关键词: ${record.segment.keywords.join(', ')}*`
        : ''
      return `#### ${index + 1}. ${docName} (相关度: ${(record.score * 100).toFixed(1)}%)\n${record.segment.content.trim()}${keywords}`
    })
    .join('\n\n')

  return `### 查询: ${query}\n\n找到 ${records.length} 条结果:\n\n${body}`
}
