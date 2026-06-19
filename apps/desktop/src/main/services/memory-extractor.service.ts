import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import { blocksToText } from '@toolman/db'
import { getMessageRepository } from '../db/repos'
import { getProviderConfig, parseModelId } from './provider.service'
import { saveMemory } from './memory.service'

const gateway = createModelGateway()

const EXTRACTION_PROMPT = `你是记忆提取助手。请从以下对话中提取值得长期记住的用户偏好、事实或约束。
只输出 JSON 数组，每项为一条简短中文陈述；若无值得记住的内容则输出 []。
不要输出 markdown 代码块或其它说明文字。

对话：
`

function parseExtractedMemories(text: string): string[] {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
  } catch {
    return []
  }
}

export async function extractMemoriesFromConversation(options: {
  workspaceId: string
  sessionId: string
  assistantId?: string
  modelId: string
}): Promise<number> {
  const rows = getMessageRepository()
    .listRows({ sessionId: options.sessionId, limit: 12 })
    .filter((row) => row.status === 'completed' || row.status === 'failed')

  if (rows.length < 2) return 0

  const transcript = rows
    .slice(-10)
    .map((row) => {
      const role = row.role === 'assistant' ? '助手' : row.role === 'user' ? '用户' : row.role
      const content = blocksToText(JSON.parse(row.contentBlocksJson) as never)
      return `${role}: ${content.trim()}`
    })
    .filter((line) => line.length > 4)
    .join('\n')

  if (!transcript.trim()) return 0

  const { providerId, model } = parseModelId(options.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) return 0

  let raw = ''
  try {
    const completion = await gateway.chatComplete(providerConfig, {
      model,
      messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}${transcript}` }],
      temperature: 0.2,
      maxTokens: 1024,
    })
    raw = completion.content.trim()
  } catch (error) {
    if (error instanceof ProviderError) return 0
    throw error
  }

  const memories = parseExtractedMemories(raw)
  let saved = 0
  for (const content of memories) {
    await saveMemory(options.workspaceId, content, options.assistantId, {
      sessionId: options.sessionId,
      source: 'conversation',
    })
    saved += 1
  }

  return saved
}
