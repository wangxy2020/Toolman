import { randomUUID } from 'node:crypto'
import type { Message } from '@toolman/shared'
import {
  blocksToText,
  createMessageRepository,
  createSessionRepository,
  runInTransaction,
} from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import { clearSessionMessages } from '../session.service'

export async function replaceProxySessionMessages(
  sessionId: string,
  messages: Message[],
  title?: string,
): Promise<void> {
  clearSessionMessages({ sessionId })

  if (messages.length === 0) {
    if (title) {
      getSessionRepository().update(sessionId, { title })
    }
    return
  }

  const idMap = new Map<string, string>()
  for (const message of messages) {
    idMap.set(message.id, randomUUID())
  }

  runInTransaction(getDatabase(), (tx) => {
    const messageRepo = createMessageRepository(tx)
    const sessionRepo = createSessionRepository(tx)

    for (const message of messages) {
      const contentBlocks = message.contentBlocks
      messageRepo.createWithId({
        id: idMap.get(message.id)!,
        sessionId,
        parentMessageId: message.parentMessageId
          ? idMap.get(message.parentMessageId) ?? null
          : null,
        role: message.role,
        modelId: message.modelId,
        content: blocksToText(contentBlocks),
        contentBlocks,
        status: message.status === 'streaming' ? 'completed' : message.status,
        touchSession: false,
      })
    }

    sessionRepo.touch(sessionId, messages.length)
    if (title) {
      sessionRepo.update(sessionId, { title })
    }
  })
}
