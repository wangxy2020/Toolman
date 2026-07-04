import { UuidSchema } from '../ipc/base.js'

export const SESSION_ACTIVE_TASK_ID_KEY = 'activeTaskId'

export function parseSessionActiveTaskId(
  metadata: Record<string, unknown> | undefined | null,
): string | undefined {
  if (!metadata) return undefined
  const raw = metadata[SESSION_ACTIVE_TASK_ID_KEY]
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = UuidSchema.safeParse(raw.trim())
  return parsed.success ? parsed.data : undefined
}

export function patchSessionActiveTaskId(
  metadata: Record<string, unknown> | undefined | null,
  taskId: string | null | undefined,
): Record<string, unknown> {
  const base = metadata ? { ...metadata } : {}
  if (taskId?.trim()) {
    base[SESSION_ACTIVE_TASK_ID_KEY] = taskId.trim()
  } else {
    delete base[SESSION_ACTIVE_TASK_ID_KEY]
  }
  return base
}
