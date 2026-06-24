import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { P2pGroupChatMessageSchema, type P2pGroupChatMessage } from '@toolman/shared'

const MAX_MESSAGES_PER_WORKSPACE = 1000

type StoredChatFile = {
  messages: P2pGroupChatMessage[]
}

function chatFilePath(workspaceId: string): string {
  const dir = join(app.getPath('userData'), 'p2p', 'group-chat')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, `${workspaceId}.json`)
}

export function readGroupChatMessages(workspaceId: string): P2pGroupChatMessage[] {
  const path = chatFilePath(workspaceId)
  if (!existsSync(path)) {
    return []
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredChatFile
    if (!Array.isArray(parsed.messages)) {
      return []
    }
    return parsed.messages
      .map((item) => {
        try {
          return P2pGroupChatMessageSchema.parse(item)
        } catch {
          return null
        }
      })
      .filter((item): item is P2pGroupChatMessage => item != null)
  } catch {
    return []
  }
}

function writeGroupChatMessages(workspaceId: string, messages: P2pGroupChatMessage[]): void {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt)
  const trimmed =
    sorted.length > MAX_MESSAGES_PER_WORKSPACE
      ? sorted.slice(-MAX_MESSAGES_PER_WORKSPACE)
      : sorted
  writeFileSync(chatFilePath(workspaceId), JSON.stringify({ messages: trimmed }, null, 2), 'utf8')
}

/** Returns true when the message was newly persisted. */
export function appendGroupChatMessage(message: P2pGroupChatMessage): boolean {
  const messages = readGroupChatMessages(message.workspaceId)
  if (messages.some((item) => item.id === message.id)) {
    return false
  }
  writeGroupChatMessages(message.workspaceId, [...messages, message])
  return true
}

/** Returns true when a message was removed. */
export function removeGroupChatMessage(workspaceId: string, messageId: string): boolean {
  const messages = readGroupChatMessages(workspaceId)
  const next = messages.filter((item) => item.id !== messageId)
  if (next.length === messages.length) {
    return false
  }
  writeGroupChatMessages(workspaceId, next)
  return true
}

/** Returns true when messages existed before clear. */
export function clearGroupChatMessages(workspaceId: string): boolean {
  const messages = readGroupChatMessages(workspaceId)
  if (messages.length === 0) {
    return false
  }
  writeGroupChatMessages(workspaceId, [])
  return true
}

export function replaceGroupChatMessages(
  workspaceId: string,
  messages: P2pGroupChatMessage[],
): void {
  writeGroupChatMessages(workspaceId, messages)
}
