import { UuidSchema } from '../ipc/base.js'

export const MESSAGE_TASK_ID_KEY = 'taskId'

export function parseMessageTaskId(
  metadata: Record<string, unknown> | undefined | null,
): string | undefined {
  if (!metadata) return undefined
  const raw = metadata[MESSAGE_TASK_ID_KEY]
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = UuidSchema.safeParse(raw.trim())
  return parsed.success ? parsed.data : undefined
}

export function buildMessageTaskMetadata(taskId: string): Record<string, unknown> {
  return { [MESSAGE_TASK_ID_KEY]: taskId }
}
