import type { ChannelPlatformId } from '@toolman/shared'
import { blocksToText } from '@toolman/db'
import { getMessageRepository } from '../db/repos'
import { createSession } from './session.service'
import { sendMessage } from './agent.service'
import { getAssistantRow } from './assistant.service'
import { readJsonFile, writeJsonFileAtomic } from '../utils/atomic-json-file'
import { app } from 'electron'
import { join } from 'node:path'

const SESSION_MAP_FILE = 'im-channel-sessions.json'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'

type SessionMap = Record<string, string>

const sessionCreationLocks = new Map<string, Promise<string>>()

function sessionMapPath(): string {
  return join(app.getPath('userData'), SESSION_MAP_FILE)
}

function sessionKey(platform: ChannelPlatformId, chatId: string): string {
  return `${platform}:${chatId}`
}

function isChatAllowed(allowedChatIds: string, chatId: string): boolean {
  const normalized = allowedChatIds
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (normalized.length === 0) return true
  return normalized.includes(chatId)
}

async function getOrCreateSession(
  platform: ChannelPlatformId,
  chatId: string,
  assistantId: string,
): Promise<string> {
  const key = sessionKey(platform, chatId)
  const map = readJsonFile<SessionMap>(sessionMapPath(), {})
  const existing = map[key]
  if (existing) return existing

  const pending = sessionCreationLocks.get(key)
  if (pending) return pending

  const promise = (async () => {
    const latest = readJsonFile<SessionMap>(sessionMapPath(), {})
    if (latest[key]) return latest[key]

    const session = createSession({
      workspaceId: DEFAULT_WORKSPACE_ID,
      assistantId,
      title: `${platform} · ${chatId.slice(0, 12)}`,
      type: 'chat',
      metadata: {
        channelPlatform: platform,
        channelChatId: chatId,
      },
    })

    latest[key] = session.id
    writeJsonFileAtomic(sessionMapPath(), latest)
    return session.id
  })()

  sessionCreationLocks.set(key, promise)
  try {
    return await promise
  } finally {
    sessionCreationLocks.delete(key)
  }
}

async function waitForAssistantReply(
  assistantMessageId: string,
  timeoutMs = 300_000,
): Promise<string> {
  const messages = getMessageRepository()
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const row = messages.findRowById(assistantMessageId)
    if (!row) throw new Error('Assistant message not found')

    if (row.status === 'completed' || row.status === 'failed' || row.status === 'aborted') {
      const blocks = JSON.parse(row.contentBlocksJson) as Array<{ type: string; text?: string }>
      return blocksToText(blocks).trim()
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error('频道回复超时')
}

export async function handleInboundChannelMessage(options: {
  platform: ChannelPlatformId
  chatId: string
  text: string
  assistantId: string
  allowedChatIds: string
}): Promise<string> {
  const { platform, chatId, text, assistantId, allowedChatIds } = options
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (!assistantId) throw new Error('未绑定智能体')
  if (!isChatAllowed(allowedChatIds, chatId)) {
    throw new Error('该聊天 ID 不在允许列表中')
  }

  const assistant = getAssistantRow(assistantId)
  if (!assistant) throw new Error('绑定的智能体不存在')

  const sessionId = await getOrCreateSession(platform, chatId, assistantId)
  const result = await sendMessage({
    sessionId,
    contentBlocks: [{ type: 'text', text: trimmed }],
    modelIds: [assistant.modelId],
    options: {
      enableTools: true,
      isChannelMessage: true,
    },
  })

  const assistantMessageId = result.assistantMessageIds[0]
  if (!assistantMessageId) return ''
  return waitForAssistantReply(assistantMessageId)
}
