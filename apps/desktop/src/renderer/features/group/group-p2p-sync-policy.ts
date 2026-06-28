/**
 * 群组 P2P 同步策略（智能体 / 知识库 / 笔记 / 工作流）
 *
 * 1. Bootstrap（拉取活动事件 + blob）：仅在「进入群组会话」与「入群」时各一次；手动刷新可重跑。
 * 2. 日常：只读本地投影（P2pResourceList 等），不触发网络 catch-up。
 * 3. 活动驱动：监听群活动 append/apply，按资源类型区分 metadata（权限/列表）与 content（文件/包体）。
 */

import { IpcChannel } from '@toolman/shared'

export type GroupSharedResourceType = 'Agent' | 'Knowledge' | 'Note' | 'Workflow'

export type GroupActivitySyncKind = 'metadata' | 'content'

export type P2pEventLike = {
  workspaceId?: string
  resourceType?: string
  eventType?: string
  payload?: Record<string, unknown>
}

const RESOURCE_MUTATIONS = new Set(['Shared', 'Created', 'Updated', 'Deleted'])

const bootstrappedWorkspaceIds = new Set<string>()

export async function bootstrapGroupWorkspace(workspaceId: string, options?: { force?: boolean }): Promise<boolean> {
  const result = await window.api.invoke(IpcChannel.P2pSyncCatchUp, {
    workspaceId,
    ...(options?.force ? { force: true } : {}),
  })
  if (!result.ok) {
    console.warn(`[group-p2p] bootstrap failed: ${result.error.message}`)
    return false
  }
  bootstrappedWorkspaceIds.add(workspaceId)
  return true
}

/** 本会话内首次进入某群组时 bootstrap 一次（上线后打开群组页） */
export function ensureGroupWorkspaceBootstrapped(workspaceId: string | null): void {
  if (!workspaceId || bootstrappedWorkspaceIds.has(workspaceId)) return
  void bootstrapGroupWorkspace(workspaceId).then((ok) => {
    if (ok) {
      bootstrappedWorkspaceIds.add(workspaceId)
    }
  })
}

/** 入群成功后强制 bootstrap（新成员补全历史活动与文件） */
export async function bootstrapGroupWorkspaceAfterJoin(workspaceId: string): Promise<void> {
  bootstrappedWorkspaceIds.delete(workspaceId)
  await bootstrapGroupWorkspace(workspaceId, { force: true })
}

export function subscribeGroupResourcePanelRefresh(
  workspaceId: string,
  resourceType: GroupSharedResourceType,
  reload: () => void,
): () => void {
  const scheduleReload = (payload?: unknown) => {
    const data = payload as { workspaceId?: string } | undefined
    if (data?.workspaceId && data.workspaceId !== workspaceId) return
    reload()
  }

  const unsubMember = window.api.subscribe('p2p:member:changed', scheduleReload)
  const unsubSync = window.api.subscribe('p2p:sync:completed', scheduleReload)
  const unsubEvent = window.api.subscribe('p2p:event:appended', (payload) => {
    const data = payload as { workspaceId?: string; resourceType?: string } | undefined
    if (data?.workspaceId !== workspaceId) return
    if (data?.resourceType === resourceType || data?.resourceType === 'Member') {
      scheduleReload(payload)
    }
  })

  return () => {
    unsubMember()
    unsubSync()
    unsubEvent()
  }
}

export function createGroupPanelRefreshHandler(
  workspaceId: string,
  reload: () => void | Promise<void>,
): () => Promise<void> {
  return async () => {
    await bootstrapGroupWorkspace(workspaceId)
    await reload()
  }
}

function hasStringPayload(event: P2pEventLike, key: string): boolean {
  const value = event.payload?.[key]
  return typeof value === 'string' && value.length > 0
}

function isKnowledgeDocumentContentUpdate(event: P2pEventLike): boolean {
  return event.eventType === 'Updated' && hasStringPayload(event, 'content_hash')
}

function isKnowledgePermissionUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return Boolean(event.payload?.document_permission || event.payload?.document_permissions)
}

function isAgentContentUpdate(event: P2pEventLike): boolean {
  return event.eventType === 'Updated' && hasStringPayload(event, 'package_json')
}

function isAgentMetadataUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return Boolean(event.payload?.session_permission || event.payload?.session_permissions)
}

function isNoteContentUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return hasStringPayload(event, 'loro_oplog') || hasStringPayload(event, 'content')
}

function isNoteMetadataUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return (
    event.payload?.permission === 'read' ||
    event.payload?.permission === 'write' ||
    event.payload?.permission === 'admin'
  )
}

function isWorkflowContentUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return (
    hasStringPayload(event, 'workflow_json') ||
    hasStringPayload(event, 'package_json') ||
    hasStringPayload(event, 'content_hash')
  )
}

function isWorkflowMetadataUpdate(event: P2pEventLike): boolean {
  if (event.eventType !== 'Updated') return false
  return Boolean(event.payload?.permission)
}

export function classifyGroupResourceActivity(
  event: P2pEventLike,
  workspaceId: string,
  resourceType: GroupSharedResourceType,
): GroupActivitySyncKind | null {
  if (event.workspaceId !== workspaceId || event.resourceType !== resourceType) return null
  if (typeof event.eventType !== 'string' || !RESOURCE_MUTATIONS.has(event.eventType)) return null

  if (event.eventType === 'Shared' || event.eventType === 'Created' || event.eventType === 'Deleted') {
    return 'content'
  }

  if (event.eventType !== 'Updated') return null

  switch (resourceType) {
    case 'Agent':
      if (isAgentContentUpdate(event)) return 'content'
      if (isAgentMetadataUpdate(event)) return 'metadata'
      return null
    case 'Knowledge':
      if (isKnowledgeDocumentContentUpdate(event)) return 'content'
      if (isKnowledgePermissionUpdate(event)) return 'metadata'
      return null
    case 'Note':
      if (isNoteContentUpdate(event)) return 'content'
      if (isNoteMetadataUpdate(event)) return 'metadata'
      return null
    case 'Workflow':
      if (isWorkflowContentUpdate(event)) return 'content'
      if (isWorkflowMetadataUpdate(event)) return 'metadata'
      return null
    default:
      return null
  }
}

export function isKnowledgeResourceListEvent(event: P2pEventLike, workspaceId: string): boolean {
  if (event.workspaceId !== workspaceId || event.resourceType !== 'Knowledge') return false
  const kind = classifyGroupResourceActivity(event, workspaceId, 'Knowledge')
  return kind === 'metadata' || event.eventType === 'Shared' || event.eventType === 'Deleted'
}

export function isKnowledgeDocumentContentEvent(
  event: P2pEventLike,
  workspaceId: string,
  kbId: string,
): boolean {
  if (event.workspaceId !== workspaceId || event.resourceType !== 'Knowledge') return false
  const eventKbId = event.payload?.kb_id
  if (typeof eventKbId === 'string' && eventKbId !== kbId) return false

  if (event.eventType === 'Shared' || event.eventType === 'Created' || event.eventType === 'Deleted') {
    return true
  }
  if (event.eventType === 'Updated') {
    return isKnowledgeDocumentContentUpdate(event)
  }
  return false
}

function subscribeActivityEvents(handler: (payload: unknown) => void): () => void {
  const unsubAppended = window.api.subscribe('p2p:event:appended', handler)
  const unsubApplied = window.api.subscribe('p2p:sync:event-applied', handler)
  return () => {
    unsubAppended()
    unsubApplied()
  }
}

export interface GroupResourceActivityHandlers {
  onMetadata?: () => void
  onContent?: () => void
}

/** 按资源类型订阅群活动；metadata 只刷新列表，content 触发内容投影/下载 */
export function subscribeGroupResourceActivity(
  workspaceId: string,
  resourceType: GroupSharedResourceType,
  handlers: GroupResourceActivityHandlers,
): () => void {
  return subscribeActivityEvents((payload) => {
    const kind = classifyGroupResourceActivity(payload as P2pEventLike, workspaceId, resourceType)
    if (kind === 'metadata') {
      handlers.onMetadata?.()
    } else if (kind === 'content') {
      handlers.onContent?.()
    }
  })
}

export function subscribeKnowledgeResourceListEvents(
  workspaceId: string,
  onEvent: () => void,
): () => void {
  return subscribeActivityEvents((payload) => {
    if (isKnowledgeResourceListEvent(payload as P2pEventLike, workspaceId)) {
      onEvent()
    }
  })
}

export function subscribeKnowledgeDocumentContentEvents(
  workspaceId: string,
  kbId: string,
  onEvent: () => void,
): () => void {
  return subscribeActivityEvents((payload) => {
    if (isKnowledgeDocumentContentEvent(payload as P2pEventLike, workspaceId, kbId)) {
      onEvent()
    }
  })
}
