import { IpcChannel, type Assistant, type Workspace } from '@toolman/shared'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'
import { buildChatWithKnowledgeFilesDraft } from '../knowledge/knowledge-chat-files'
import type { PendingAttachment } from './chat-attachments'
import type { OpenGroupAgentSessionRequest } from '../group/group-agent-open'

export async function stageKnowledgeFilesForChat(
  items: KnowledgeFilePanelItem[],
): Promise<{ attachments: PendingAttachment[]; draftText: string } | { error: string }> {
  const paths = items
    .map((item) => item.absolutePath?.trim())
    .filter((path): path is string => Boolean(path))
  if (paths.length === 0) {
    return { error: '所选知识库文件没有可用的本地路径' }
  }

  const stageResult = await window.api.invoke(IpcChannel.ChatStageAttachments, { paths })
  if (!stageResult.ok) {
    return { error: stageResult.error.message }
  }

  const staged = stageResult.data as {
    items: Array<{
      path: string
      name: string
      blobHash: string
      mimeType: string
      kind: 'file' | 'image'
    }>
    errors?: Array<{ path: string; message: string }>
  }

  if (staged.errors?.length) {
    return {
      error: staged.errors
        .map((item) => `${item.path.split(/[/\\]/).pop() ?? item.path}：${item.message}`)
        .join('\n'),
    }
  }
  if (staged.items.length === 0) {
    return { error: '所选知识库文件没有可用的本地路径' }
  }

  return {
    attachments: staged.items.map((item) => ({
      path: item.path,
      name: item.name,
      blobHash: item.blobHash,
      mimeType: item.mimeType,
      kind: item.kind,
    })),
    draftText: buildChatWithKnowledgeFilesDraft(items.map((item) => item.title)),
  }
}

export async function openGroupAgentSession(
  request: OpenGroupAgentSessionRequest,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const result = await window.api.invoke(IpcChannel.P2pAgentOpenSession, {
    p2pWorkspaceId: request.p2pWorkspaceId,
    resourceId: request.resourceId,
    sourceSessionId: request.sourceSessionId,
    sessionTitle: request.sessionTitle,
    groupName: request.groupName,
    sharedAgentName: request.sharedAgentName,
    permission: request.permission,
    ownerMemberId: request.ownerMemberId,
    sourceAssistantId: request.sourceAssistantId,
    referencedModelId: request.referencedModelId,
  })

  if (!result.ok) {
    return { ok: false, error: result.error.message }
  }

  const data = result.data as { sessionId: string }
  return { ok: true, sessionId: data.sessionId }
}

export async function updateAssistantModel(
  assistant: Assistant,
  modelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await window.api.invoke(IpcChannel.AssistantUpdate, {
    id: assistant.id,
    modelId,
  })
  if (!result.ok) {
    return { ok: false, error: result.error.message }
  }
  return { ok: true }
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  settings: Record<string, unknown>,
): Promise<{ ok: true; workspace: Workspace } | { ok: false; error: string }> {
  const result = await window.api.invoke(IpcChannel.WorkspaceUpdate, {
    id: workspaceId,
    settings,
  })
  if (!result.ok) {
    return { ok: false, error: result.error.message }
  }
  return { ok: true, workspace: result.data as Workspace }
}

export async function loadDefaultWorkspace(): Promise<Workspace | null> {
  const result = await window.api.invoke(IpcChannel.WorkspaceGetDefault)
  if (!result.ok) return null
  return result.data as Workspace
}
