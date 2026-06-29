import { listAssistants } from './assistant.service'
import { logStructured } from './structured-log.service'
import { sendMessage } from './agent.service'
import { getMessageRepository, getSessionRepository } from '../db/repos'

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'

const lastHeartbeatAt = new Map<string, number>()
const inFlightHeartbeats = new Set<string>()
let schedulerStarted = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export function startHeartbeatScheduler(workspaceId: string = DEFAULT_WORKSPACE_ID): void {
  if (schedulerStarted) return
  schedulerStarted = true

  const bootAt = Date.now()
  for (const assistant of listAssistants({ workspaceId })) {
    if (assistant.parameters.heartbeatEnabled) {
      lastHeartbeatAt.set(assistant.id, bootAt)
    }
  }

  heartbeatTimer = setInterval(() => {
    void runHeartbeatTick(workspaceId)
  }, 60_000)
}

export function stopHeartbeatScheduler(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  schedulerStarted = false
}

async function runHeartbeatTick(workspaceId: string): Promise<void> {
  const assistants = listAssistants({ workspaceId })
  const sessions = getSessionRepository()
  const now = Date.now()

  const messages = getMessageRepository()

  for (const assistant of assistants) {
    if (!assistant.parameters.heartbeatEnabled) continue
    if (inFlightHeartbeats.has(assistant.id)) continue

    const intervalMs = (assistant.parameters.heartbeatIntervalMinutes ?? 30) * 60_000
    const last = lastHeartbeatAt.get(assistant.id) ?? now
    if (now - last < intervalMs) continue

    const rows = sessions.listRows({
      workspaceId,
      assistantId: assistant.id,
      limit: 1,
    })
    const session = rows[0]
    if (!session) continue

    const hasActiveStream = messages
      .listRows({ sessionId: session.id })
      .some((row) => row.status === 'streaming')
    if (hasActiveStream) continue

    lastHeartbeatAt.set(assistant.id, now)
    inFlightHeartbeats.add(assistant.id)

    try {
      await sendMessage({
        sessionId: session.id,
        contentBlocks: [
          {
            type: 'text',
            text: '[系统心跳] 请检查工作目录与任务状态，如有未完成事项请继续推进，并简要汇报。',
          },
        ],
        options: {
          enableTools: true,
          isHeartbeat: true,
        },
      })
    } catch (error) {
      logStructured('heartbeat', 'error', `assistant ${assistant.id}:`, { detail: error })
    } finally {
      inFlightHeartbeats.delete(assistant.id)
    }
  }
}
