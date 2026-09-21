import {
  AUTOMATION_ASSISTANT_NAME,
  buildAutomationAssistantSystemPrompt,
  IpcChannel,
  isAutomationAssistantName,
  type Assistant,
} from '@toolman/shared'

import type { useChat } from '../chat/useChat'

type ChatApi = ReturnType<typeof useChat>

const ensureInFlight = new Map<string, Promise<Assistant | null>>()

function pickBootstrapModelId(chat: ChatApi, defaultModelId: string | null): string | null {
  if (defaultModelId?.trim()) return defaultModelId
  const pinned = chat.assistants.find((item) => item.isPinned && item.modelId.trim())
  if (pinned) return pinned.modelId
  const any = chat.assistants.find((item) => item.modelId.trim())
  return any?.modelId ?? chat.effectiveModelIds[0] ?? null
}

export function findAutomationAssistant(assistants: readonly Assistant[]): Assistant | null {
  return assistants.find((item) => isAutomationAssistantName(item.name)) ?? null
}

export async function ensureAutomationAssistant(options: {
  workspaceId: string
  chat: ChatApi
  defaultModelId: string | null
}): Promise<Assistant | null> {
  const { workspaceId, chat, defaultModelId } = options
  const inflight = ensureInFlight.get(workspaceId)
  if (inflight) return inflight

  const promise = (async () => {
    const desiredSystemPrompt = buildAutomationAssistantSystemPrompt()
    const existing = findAutomationAssistant(chat.assistants)
    if (existing) {
      if (existing.systemPrompt === desiredSystemPrompt && existing.isPinned) {
        return existing
      }
      const updated = await window.api.invoke(IpcChannel.AssistantUpdate, {
        id: existing.id,
        systemPrompt: desiredSystemPrompt,
        isPinned: true,
      })
      if (!updated.ok) return existing
      await chat.loadAssistants()
      return findAutomationAssistant(chat.assistants) ?? (updated.data as Assistant)
    }

    const modelId = pickBootstrapModelId(chat, defaultModelId)
    if (!modelId) return null

    const created = await window.api.invoke(IpcChannel.AssistantCreate, {
      workspaceId,
      name: AUTOMATION_ASSISTANT_NAME,
      description: '自动化任务专用助手：任务与子任务以话题形式挂载',
      systemPrompt: desiredSystemPrompt,
      modelId,
      parameters: {
        temperature: 0.7,
        permissionMode: 'auto-edit',
      },
      isPinned: true,
    })
    if (!created.ok) {
      chat.setError(created.error.message || '创建自动化智能体失败')
      return null
    }

    await chat.loadAssistants()
    return findAutomationAssistant(chat.assistants) ?? (created.data as Assistant)
  })().finally(() => {
    ensureInFlight.delete(workspaceId)
  })

  ensureInFlight.set(workspaceId, promise)
  return promise
}
