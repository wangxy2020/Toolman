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
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
  type ProjectManagementAgentTab,
} from '@toolman/shared'

import type { useChat } from '../chat/useChat'
import {
  needsProjectManagementSessionMetadata,
  projectManagementSessionMetadataPatch,
  resolveProjectManagementAgentSession,
} from './projectManagementAgentLink'

type ChatApi = ReturnType<typeof useChat>

export type EnsureProjectManagementAgentLinkResult =
  | { status: 'linked'; assistant: Assistant; session: Session }
  | { status: 'no_model' }
  | { status: 'error'; message: string }

function pickBootstrapModelId(chat: ChatApi, defaultModelId: string | null): string | null {
  if (defaultModelId?.trim()) return defaultModelId
  const pinned = chat.assistants.find((item) => item.isPinned && item.modelId.trim())
  if (pinned) return pinned.modelId
  const any = chat.assistants.find((item) => item.modelId.trim())
  return any?.modelId ?? chat.effectiveModelIds[0] ?? null
}

async function ensureProjectManagementAssistant(
  workspaceId: string,
  chat: ChatApi,
  modelId: string,
): Promise<Assistant | null> {
  const existing = chat.assistants.find(
    (item) => item.name.trim() === PROJECT_MANAGEMENT_ASSISTANT_NAME,
  )
  if (existing) return existing

  const result = await window.api.invoke(IpcChannel.AssistantCreate, {
    workspaceId,
    name: PROJECT_MANAGEMENT_ASSISTANT_NAME,
    description: 'EPC 项目管理专用助手',
    systemPrompt: buildProjectManagementAssistantSystemPrompt(),
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

async function ensureProjectManagementSession(
  workspaceId: string,
  chat: ChatApi,
  assistant: Assistant,
  tab: ProjectManagementAgentTab,
): Promise<Session | null> {
  const sessionTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]
  let session =
    chat.sessions.find(
      (item) => item.assistantId === assistant.id && item.title.trim() === sessionTitle,
    ) ?? null

  if (!session) {
    const result = await window.api.invoke(IpcChannel.SessionCreate, {
      workspaceId,
      assistantId: assistant.id,
      title: sessionTitle,
      metadata: buildProjectManagementSessionMetadata(tab),
    })
    if (!result.ok) return null

    await chat.loadSessions()
    session =
      chat.sessions.find(
        (item) => item.assistantId === assistant.id && item.title.trim() === sessionTitle,
      ) ?? (result.data as Session)
  } else if (needsProjectManagementSessionMetadata(session, tab)) {
    const result = await window.api.invoke(IpcChannel.SessionUpdate, {
      id: session.id,
      metadata: projectManagementSessionMetadataPatch(session, tab),
    })
    if (result.ok) {
      session = result.data as Session
      await chat.loadSessions()
    }
  }

  return session
}

export async function ensureProjectManagementAgentLink(
  workspaceId: string,
  tab: ProjectManagementAgentTab,
  chat: ChatApi,
  defaultModelId: string | null,
): Promise<EnsureProjectManagementAgentLinkResult> {
  const existing = resolveProjectManagementAgentSession(chat.assistants, chat.sessions, tab)
  if (existing) {
    if (needsProjectManagementSessionMetadata(existing.session, tab)) {
      const result = await window.api.invoke(IpcChannel.SessionUpdate, {
        id: existing.session.id,
        metadata: projectManagementSessionMetadataPatch(existing.session, tab),
      })
      if (result.ok) {
        await chat.loadSessions()
        const refreshed = resolveProjectManagementAgentSession(chat.assistants, chat.sessions, tab)
        if (refreshed) {
          return { status: 'linked', ...refreshed }
        }
      }
    }
    return { status: 'linked', ...existing }
  }

  const modelId = pickBootstrapModelId(chat, defaultModelId)
  if (!modelId) {
    return { status: 'no_model' }
  }

  const assistant = await ensureProjectManagementAssistant(workspaceId, chat, modelId)
  if (!assistant) {
    return { status: 'error', message: '创建项目管理智能体失败' }
  }

  const session = await ensureProjectManagementSession(workspaceId, chat, assistant, tab)
  if (!session) {
    return { status: 'error', message: '创建项目管理话题失败' }
  }

  return { status: 'linked', assistant, session }
}
