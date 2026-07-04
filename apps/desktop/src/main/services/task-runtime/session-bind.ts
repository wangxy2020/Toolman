import { parseSessionActiveTaskId, patchSessionActiveTaskId, isTerminalTaskStatus } from '@toolman/shared'

import { getSessionRepository } from '../../db/repos'
import { getAgentTask } from './store'

function parseSessionMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function bindTaskToSession(sessionId: string, taskId: string): void {
  const sessions = getSessionRepository()
  const session = sessions.findRowById(sessionId)
  if (!session) {
    throw new Error('话题不存在')
  }

  const metadata = patchSessionActiveTaskId(parseSessionMetadata(session.metadataJson), taskId)
  sessions.update(sessionId, { metadata })
}

export function unbindTaskFromSession(sessionId: string, taskId: string): boolean {
  const sessions = getSessionRepository()
  const session = sessions.findRowById(sessionId)
  if (!session) return false

  const metadata = parseSessionMetadata(session.metadataJson)
  if (parseSessionActiveTaskId(metadata) !== taskId) return false

  sessions.update(sessionId, { metadata: patchSessionActiveTaskId(metadata, null) })
  return true
}

/** Drop session binding when the bound task has already finished (failed/completed/cancelled). */
export function clearStaleTerminalSessionBinding(sessionId: string): boolean {
  const sessions = getSessionRepository()
  const session = sessions.findRowById(sessionId)
  if (!session) return false

  const metadata = parseSessionMetadata(session.metadataJson)
  const taskId = parseSessionActiveTaskId(metadata)
  if (!taskId) return false

  const task = getAgentTask(taskId)
  if (!task || !isTerminalTaskStatus(task.status)) return false

  return unbindTaskFromSession(sessionId, taskId)
}
