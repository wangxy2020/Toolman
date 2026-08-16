import { eq } from 'drizzle-orm'
import {
  AGENT_TASK_LOCK_SCOPE_GLOBAL,
  isActiveTaskStatus,
  type AgentTask,
} from '@toolman/shared'
import type { ToolmanDatabase } from '../index.js'
import { agentTaskLock } from '../schema/task-runtime.js'

export function getGlobalAgentTaskLock(
  db: ToolmanDatabase,
): { taskId: string; workerId: string; acquiredAt: number } | null {
  const row = db
    .select()
    .from(agentTaskLock)
    .where(eq(agentTaskLock.id, AGENT_TASK_LOCK_SCOPE_GLOBAL))
    .get()
  if (!row) return null
  return {
    taskId: row.taskId,
    workerId: row.workerId,
    acquiredAt: row.acquiredAt.getTime(),
  }
}

export function releaseGlobalAgentTaskLock(db: ToolmanDatabase, taskId: string): void {
  const existing = getGlobalAgentTaskLock(db)
  if (!existing || existing.taskId !== taskId) {
    return
  }
  db.delete(agentTaskLock).where(eq(agentTaskLock.id, AGENT_TASK_LOCK_SCOPE_GLOBAL)).run()
}

export function tryAcquireGlobalAgentTaskLock(
  db: ToolmanDatabase,
  taskId: string,
  workerId: string,
  getById: (id: string) => AgentTask | null,
): boolean {
  const task = getById(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  const existing = getGlobalAgentTaskLock(db)
  if (existing && existing.taskId !== taskId) {
    const holder = getById(existing.taskId)
    if (holder && isActiveTaskStatus(holder.status)) {
      return false
    }
    releaseGlobalAgentTaskLock(db, existing.taskId)
  }

  const now = new Date()
  db
    .insert(agentTaskLock)
    .values({
      id: AGENT_TASK_LOCK_SCOPE_GLOBAL,
      taskId,
      workerId,
      acquiredAt: now,
    })
    .onConflictDoUpdate({
      target: agentTaskLock.id,
      set: { taskId, workerId, acquiredAt: now },
    })
    .run()

  return true
}
