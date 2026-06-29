import type { Assistant, P2pSharedResource, Session } from '@toolman/shared'
import {
  getAgentSessionPermission,
  isShareableGroupAgentSource,
  resolveGroupAgentPanelTitle,
} from './group-agent-utils'
import { agentSelectionKey, parseAgentSelectionKey } from './group-agent-selection'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'
import type { TranslateFn } from '../../i18n/I18nProvider'
import type { AddAgentsDisabledReason, PendingAgentDelete } from './group-agents-panel-types'

export function canDeleteGroupAgentResource(
  resource: { sharedBy: string },
  canWriteWorkspace: boolean,
  canManageGroupResources: boolean,
  selfMemberId: string | null,
): boolean {
  return (
    canWriteWorkspace &&
    (canManageGroupResources || (selfMemberId != null && resource.sharedBy === selfMemberId))
  )
}

export function hasShareableGroupAgents(
  shareableAssistants: Assistant[],
  sharedResources: P2pSharedResource[],
): boolean {
  return shareableAssistants.some((assistant) => {
    const resource = sharedResources.find(
      (item) => (item.localResourceId ?? item.id) === assistant.id,
    )
    if (!resource) return true
    const sharedSessionIds = resource.sharedSessionIds
    if (!sharedSessionIds || sharedSessionIds.length === 0) return false
    return true
  })
}

export function getAddAgentsDisabledReason(
  sharing: boolean,
  canWriteWorkspace: boolean,
  sourceWorkspaceId: string | null,
  shareableAssistantsCount: number,
  hasShareableAgents: boolean,
): AddAgentsDisabledReason {
  if (sharing) return null
  if (!canWriteWorkspace) return 'readonly'
  if (!sourceWorkspaceId) return 'workspace'
  if (shareableAssistantsCount === 0) return 'noAgents'
  if (!hasShareableAgents) return 'allShared'
  return null
}

export function resolveGroupAgentResourceAssistant(
  resource: P2pSharedResource,
  assistantsById: Map<string, Assistant>,
  shareableAssistants: Assistant[],
): Assistant | null {
  const preferredId = resource.localResourceId ?? resource.id
  const direct = assistantsById.get(preferredId) ?? null
  if (direct && isShareableGroupAgentSource(direct)) return direct
  return shareableAssistants.find((item) => item.id === preferredId) ?? null
}

export function buildOpenGroupAgentSessionRequest(
  resource: P2pSharedResource,
  assistant: Assistant | null,
  session: Session,
  p2pWorkspaceId: string,
  workspaceName: string,
  selfMemberId: string | null,
): OpenGroupAgentSessionRequest {
  const isOwner = selfMemberId != null && resource.sharedBy === selfMemberId
  return {
    p2pWorkspaceId,
    resourceId: resource.localResourceId ?? resource.id,
    sourceSessionId: session.id,
    sessionTitle: session.title,
    groupName: workspaceName,
    sharedAgentName: resolveGroupAgentPanelTitle(resource, assistant),
    permission: getAgentSessionPermission(resource, session.id),
    ownerMemberId: resource.sharedBy,
    sourceAssistantId: assistant?.id ?? resource.localResourceId ?? resource.id,
    referencedModelId: resource.sharedModelId ?? assistant?.modelId ?? 'openai/gpt-4o-mini',
    isOwner,
    localSessionId: isOwner ? session.id : undefined,
  }
}

export function toggleAgentSelection(current: Set<string>, selectionKey: string): Set<string> {
  const next = new Set(current)
  if (next.has(selectionKey)) next.delete(selectionKey)
  else next.add(selectionKey)
  return next
}

export function toggleAgentSectionSelection(
  current: Set<string>,
  selectionKeys: string[],
): Set<string> {
  const allSelected =
    selectionKeys.length > 0 && selectionKeys.every((key) => current.has(key))
  const next = new Set(current)
  if (allSelected) {
    for (const key of selectionKeys) next.delete(key)
  } else {
    for (const key of selectionKeys) next.add(key)
  }
  return next
}

export function collectAllSectionKeys(sectionKeysMap: Record<string, string[]>): Set<string> {
  const next = new Set<string>()
  for (const keys of Object.values(sectionKeysMap)) {
    for (const key of keys) next.add(key)
  }
  return next
}

export function removeAgentSelectionKeysForResource(
  keys: Set<string>,
  resourceId: string,
): Set<string> {
  const next = new Set(keys)
  for (const key of keys) {
    if (key.startsWith(`${resourceId}:`)) next.delete(key)
  }
  return next
}

export function removeAgentSelectionKeysForSessions(
  keys: Set<string>,
  groups: Array<{ resourceId: string; sessionIds: string[] }>,
): Set<string> {
  const next = new Set(keys)
  for (const group of groups) {
    for (const sessionId of group.sessionIds) {
      next.delete(agentSelectionKey(group.resourceId, sessionId))
    }
  }
  return next
}

export function groupAgentSelectionByResource(
  selectedKeys: Set<string>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const key of selectedKeys) {
    const parsed = parseAgentSelectionKey(key)
    if (!parsed) continue
    const bucket = grouped.get(parsed.resourceId) ?? []
    bucket.push(parsed.sessionId)
    grouped.set(parsed.resourceId, bucket)
  }
  return grouped
}

export function buildSessionRemovePreview(sessionIds: string[]): {
  preview: string
  suffix: string
} {
  const suffix =
    sessionIds.length > 2
      ? ` 等 ${sessionIds.length} 个话题`
      : sessionIds.length > 1
        ? ''
        : ''
  const preview =
    sessionIds.length > 2 ? `${sessionIds.length} 个话题` : `${sessionIds.length} 个共享话题`
  return { preview, suffix }
}

export function buildBulkSessionDelete(
  grouped: Map<string, string[]>,
  t: TranslateFn,
): PendingAgentDelete | null {
  if (grouped.size === 0) return null

  if (grouped.size === 1) {
    return null
  }

  const total = [...grouped.values()].reduce((sum, ids) => sum + ids.length, 0)
  return {
    kind: 'sessions',
    groups: [...grouped.entries()].map(([resourceId, sessionIds]) => ({
      resourceId,
      sessionIds,
    })),
    message: t('groupPage.confirm.agents.removeSelectedTopics', { count: total }),
  }
}
