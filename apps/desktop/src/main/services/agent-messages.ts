import {
  MessageDeleteInputSchema,
  MessageListInputSchema,
} from '@toolman/shared'
import { createMessageRepository, runInTransaction } from '@toolman/db'

import { getMessageRepository } from '../db/repos'
import { getDatabase } from '../bootstrap/database'
import { toIpcMessage } from '../mappers/chat'

export function recoverStaleStreamingMessages() {
  getMessageRepository().recoverStaleStreaming({
    code: 'ABORTED',
    message: '应用重启，生成已中断',
    retryable: false,
  })
}

export function listMessages(input: unknown) {
  const data = MessageListInputSchema.parse(input)
  const limit = data.pagination?.limit ?? 200

  const rows = getMessageRepository().listRows({
    sessionId: data.sessionId,
    limit,
  })

  return { items: rows.map(toIpcMessage) }
}

export function deleteMessage(input: unknown): boolean {
  const data = MessageDeleteInputSchema.parse(input)
  return runInTransaction(getDatabase(), (tx) => {
    const messages = createMessageRepository(tx)
    const row = messages.findRowById(data.messageId)
    if (!row || row.sessionId !== data.sessionId) return false
    return messages.delete(data.messageId)
  })
}
