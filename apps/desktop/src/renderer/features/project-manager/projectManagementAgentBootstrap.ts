import {
  DOCX_MCP_SERVER_ID,
  EXCEL_MCP_SERVER_ID,
  IpcChannel,
  type Assistant,
  type Session,
} from '@toolman/shared'
import {
  buildProjectManagementAssistantSystemPrompt,
  buildProjectManagementSessionMetadata,
  buildProjectManagementSessionReconcilePatch,
  needsProjectManagementSessionReconcile,
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  resolveProjectManagementSessionForTab,
  type ProjectManagementAgentTab,
} from '@toolman/shared'

import type { useChat } from '../chat/useChat'
import { resolveProjectManagementAgentSession } from './projectManagementAgentLink'

type ChatApi = ReturnType<typeof useChat>

export type EnsureProjectManagementAgentLinkResult =
  | { status: 'linked'; assistant: Assistant; session: Session }
  | { status: 'no_model' }
  | { status: 'error'; message: string }

const linkInFlight = new Map<string, Promise<EnsureProjectManagementAgentLinkResult>>()

function pickBootstrapModelId(chat: ChatApi, defaultModelId: string | null): string | null {
  if (defaultModelId?.trim()) return defaultModelId
  const pinned = chat.assistants.find((item) => item.isPinned && item.modelId.trim())
  if (pinned) return pinned.modelId
  const any = chat.assistants.find((item) => item.modelId.trim())
  return any?.modelId ?? chat.effectiveModelIds[0] ?? null
}

async function loadAssistantSessions(
  workspaceId: string,
  assistantId: string,
): Promise<Session[]> {
  const items: Session[] = []
  let cursor: string | undefined

  for (;;) {
    const result = await window.api.invoke(IpcChannel.SessionList, {
      workspaceId,
      assistantId,
      pagination: { limit: 100, cursor },
    })
    if (!result.ok) break

    const data = result.data as { items: Session[]; nextCursor?: string }
    items.push(...data.items)
    if (!data.nextCursor) break
    cursor = data.nextCursor
  }

  return items
}

async function reconcileProjectManagementSession(
  chat: ChatApi,
  session: Session,
  tab: ProjectManagementAgentTab,
): Promise<Session> {
  if (!needsProjectManagementSessionReconcile(session, tab)) {
    return session
  }

  const patch = buildProjectManagementSessionReconcilePatch(session, tab)
  const result = await window.api.invoke(IpcChannel.SessionUpdate, {
    id: session.id,
    title: patch.title,
    metadata: patch.metadata,
  })
  if (!result.ok) {
    return session
  }

  const updated = result.data as Session
  await chat.loadSessions()
  return updated
}

async function ensureProjectManagementAssistant(
  workspaceId: string,
  chat: ChatApi,
  modelId: string,
): Promise<Assistant | null> {
  const desiredSystemPrompt = buildProjectManagementAssistantSystemPrompt()
  const existing = chat.assistants.find(
    (item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME,
  )
  if (existing) {
    if (existing.systemPrompt === desiredSystemPrompt) return existing
    const updated = await window.api.invoke(IpcChannel.AssistantUpdate, {
      id: existing.id,
      systemPrompt: desiredSystemPrompt,
    })
    if (!updated.ok) return existing
    await chat.loadAssistants()
    return (
      chat.assistants.find((item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME) ??
      (updated.data as Assistant)
    )
  }

  const result = await window.api.invoke(IpcChannel.AssistantCreate, {
    workspaceId,
    name: PROJECT_MANAGEMENT_ASSISTANT_NAME,
    description: 'EPC 项目管理专用助手',
    systemPrompt: desiredSystemPrompt,
    modelId,
    parameters: {
      permissionMode: 'auto-edit',
      mcpServerIds: [DOCX_MCP_SERVER_ID, EXCEL_MCP_SERVER_ID],
    },
    isPinned: true,
  })

  if (!result.ok) return null

  await chat.loadAssistants()
  return (
    chat.assistants.find((item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME) ??
    (result.data as Assistant)
  )
}

async function findProjectManagementSession(
  workspaceId: string,
  chat: ChatApi,
  assistantId: string,
  tab: ProjectManagementAgentTab,
): Promise<Session | null> {
  const cached = resolveProjectManagementSessionForTab(chat.sessions, assistantId, tab)
  if (cached) {
    return cached as Session
  }

  const loaded = await loadAssistantSessions(workspaceId, assistantId)
  const resolved = resolveProjectManagementSessionForTab(loaded, assistantId, tab)
  return resolved ? (resolved as Session) : null
}

async function resolveOrCreateProjectManagementSession(
  workspaceId: string,
  chat: ChatApi,
  assistant: Assistant,
  tab: ProjectManagementAgentTab,
): Promise<Session | null> {
  const existing = await findProjectManagementSession(workspaceId, chat, assistant.id, tab)
  if (existing) {
    return reconcileProjectManagementSession(chat, existing, tab)
  }

  const result = await window.api.invoke(IpcChannel.SessionCreate, {
    workspaceId,
    assistantId: assistant.id,
    title: PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab],
    metadata: buildProjectManagementSessionMetadata(tab),
  })
  if (!result.ok) return null

  await chat.loadSessions()
  const created =
    (await findProjectManagementSession(workspaceId, chat, assistant.id, tab)) ??
    (result.data as Session)
  return reconcileProjectManagementSession(chat, created, tab)
}

async function ensureProjectManagementAgentLinkInternal(
  workspaceId: string,
  tab: ProjectManagementAgentTab,
  chat: ChatApi,
  defaultModelId: string | null,
): Promise<EnsureProjectManagementAgentLinkResult> {
  const linked = resolveProjectManagementAgentSession(chat.assistants, chat.sessions, tab)
  if (linked && !needsProjectManagementSessionReconcile(linked.session, tab)) {
    return { status: 'linked', ...linked }
  }

  const modelId = pickBootstrapModelId(chat, defaultModelId)
  const assistant =
    linked?.assistant ??
    (modelId ? await ensureProjectManagementAssistant(workspaceId, chat, modelId) : null)

  if (!assistant) {
    return { status: 'no_model' }
  }

  const session = await resolveOrCreateProjectManagementSession(
    workspaceId,
    chat,
    assistant,
    tab,
  )
  if (!session) {
    return { status: 'error', message: '创建项目管理话题失败' }
  }

  return { status: 'linked', assistant, session }
}

export async function ensureProjectManagementAgentLink(
  workspaceId: string,
  tab: ProjectManagementAgentTab,
  chat: ChatApi,
  defaultModelId: string | null,
): Promise<EnsureProjectManagementAgentLinkResult> {
  const inflightKey = `${workspaceId}:${tab}`
  const inflight = linkInFlight.get(inflightKey)
  if (inflight) {
    return inflight
  }

  const promise = ensureProjectManagementAgentLinkInternal(
    workspaceId,
    tab,
    chat,
    defaultModelId,
  ).finally(() => {
    linkInFlight.delete(inflightKey)
  })

  linkInFlight.set(inflightKey, promise)
  return promise
}
