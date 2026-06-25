import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { P2pGroupChatMessageSchema, type P2pGroupChatMessage } from '@toolman/shared'

const MAX_MESSAGES_PER_WORKSPACE = 1000
const FLUSH_DEBOUNCE_MS = 300

type StoredChatFile = {
  messages: P2pGroupChatMessage[]
}

const messageCache = new Map<string, P2pGroupChatMessage[]>()
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()

function chatFilePath(workspaceId: string): string {
  const dir = join(app.getPath('userData'), 'p2p', 'group-chat')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${workspaceId}.json`)
}

function chatJournalPath(workspaceId: string): string {
  const dir = join(app.getPath('userData'), 'p2p', 'group-chat')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${workspaceId}.jsonl`)
}

function parseStoredMessages(raw: unknown): P2pGroupChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      try {
        return P2pGroupChatMessageSchema.parse(item)
      } catch {
        return null
      }
    })
    .filter((item): item is P2pGroupChatMessage => item != null)
}

function loadMessagesFromDisk(workspaceId: string): P2pGroupChatMessage[] {
  const path = chatFilePath(workspaceId)
  const byId = new Map<string, P2pGroupChatMessage>()

  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredChatFile
      for (const message of parseStoredMessages(parsed.messages)) {
        byId.set(message.id, message)
      }
    } catch {
      // ignore corrupt snapshot
    }
  }

  const journalPath = chatJournalPath(workspaceId)
  if (existsSync(journalPath)) {
    try {
      const lines = readFileSync(journalPath, 'utf8').split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const message = P2pGroupChatMessageSchema.parse(JSON.parse(line))
          byId.set(message.id, message)
        } catch {
          // skip bad journal line
        }
      }
    } catch {
      // ignore corrupt journal
    }
  }

  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
}

function getCachedMessages(workspaceId: string): P2pGroupChatMessage[] {
  const cached = messageCache.get(workspaceId)
  if (cached) return cached
  const loaded = loadMessagesFromDisk(workspaceId)
  messageCache.set(workspaceId, loaded)
  return loaded
}

function flushGroupChatMessages(workspaceId: string): void {
  const timer = flushTimers.get(workspaceId)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(workspaceId)
  }

  const messages = getCachedMessages(workspaceId)
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt)
  const trimmed =
    sorted.length > MAX_MESSAGES_PER_WORKSPACE
      ? sorted.slice(-MAX_MESSAGES_PER_WORKSPACE)
      : sorted
  messageCache.set(workspaceId, trimmed)
  writeFileSync(chatFilePath(workspaceId), JSON.stringify({ messages: trimmed }, null, 2), 'utf8')
}

function scheduleFlushGroupChatMessages(workspaceId: string): void {
  const existing = flushTimers.get(workspaceId)
  if (existing) clearTimeout(existing)
  flushTimers.set(
    workspaceId,
    setTimeout(() => {
      flushTimers.delete(workspaceId)
      flushGroupChatMessages(workspaceId)
    }, FLUSH_DEBOUNCE_MS),
  )
}

export function readGroupChatMessages(workspaceId: string): P2pGroupChatMessage[] {
  return [...getCachedMessages(workspaceId)]
}

/** Returns true when the message was newly persisted. */
export function appendGroupChatMessage(message: P2pGroupChatMessage): boolean {
  const messages = getCachedMessages(message.workspaceId)
  if (messages.some((item) => item.id === message.id)) {
    return false
  }
  messages.push(message)
  messageCache.set(message.workspaceId, messages)
  try {
    appendFileSync(chatJournalPath(message.workspaceId), `${JSON.stringify(message)}\n`, 'utf8')
  } catch {
    // journal append is best-effort; snapshot flush still persists
  }
  scheduleFlushGroupChatMessages(message.workspaceId)
  return true
}

/** Returns true when a message was removed. */
export function removeGroupChatMessage(workspaceId: string, messageId: string): boolean {
  const messages = getCachedMessages(workspaceId)
  const next = messages.filter((item) => item.id !== messageId)
  if (next.length === messages.length) {
    return false
  }
  messageCache.set(workspaceId, next)
  flushGroupChatMessages(workspaceId)
  return true
}

/** Returns true when messages existed before clear. */
export function clearGroupChatMessages(workspaceId: string): boolean {
  const messages = getCachedMessages(workspaceId)
  if (messages.length === 0) {
    return false
  }
  messageCache.set(workspaceId, [])
  flushGroupChatMessages(workspaceId)
  return true
}

export function replaceGroupChatMessages(
  workspaceId: string,
  messages: P2pGroupChatMessage[],
): void {
  messageCache.set(workspaceId, [...messages])
  flushGroupChatMessages(workspaceId)
}

export function resetGroupChatStoreCacheForTests(): void {
  for (const timer of flushTimers.values()) {
    clearTimeout(timer)
  }
  flushTimers.clear()
  messageCache.clear()
}
