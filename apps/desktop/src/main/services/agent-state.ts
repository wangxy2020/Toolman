import {
  MessageAbortInputSchema,
  MessageAbortSessionInputSchema,
} from '@toolman/shared'

import { getMessageRepository } from '../db/repos'

export const abortControllers = new Map<string, AbortController>()

export function abortMessage(input: unknown): boolean {
  const data = MessageAbortInputSchema.parse(input)
  const controller = abortControllers.get(data.messageId)
  if (!controller) return false
  controller.abort()
  return true
}

/** 中断指定会话内所有进行中的流式生成 */
export function abortSessionStreaming(input: unknown): number {
  const { sessionId } = MessageAbortSessionInputSchema.parse(input)
  const rows = getMessageRepository()
    .listRows({ sessionId })
    .filter((row) => row.status === 'streaming')

  let aborted = 0
  for (const row of rows) {
    if (abortMessage({ sessionId, messageId: row.id })) aborted++
  }
  return aborted
}
