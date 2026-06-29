import type { P2pSharedResource } from '@toolman/shared'
import { knowledgeSelectionKey, parseKnowledgeSelectionKey } from './group-knowledge-selection'
import type { GroupKnowledgeSavedDocumentRegistry } from './GroupSharedKnowledgeSection'
import type { PendingDeleteKind, SavedDocumentOverride } from './group-knowledge-panel-types'

export function canDeleteGroupKnowledgeResource(
  resource: { sharedBy: string },
  canWriteWorkspace: boolean,
  canManageGroupResources: boolean,
  selfMemberId: string | null,
): boolean {
  return (
    canWriteWorkspace &&
    (canManageGroupResources ||
      (selfMemberId != null && resource.sharedBy === selfMemberId))
  )
}

export function resolveSavedDocumentIds(
  registry: GroupKnowledgeSavedDocumentRegistry | undefined,
  p2pDocumentIds: string[],
): string[] {
  if (!registry) return []
  return p2pDocumentIds
    .map((documentId) => registry.savedByP2pDocumentId[documentId])
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export function toggleSelectionKey(current: Set<string>, selectionKey: string): Set<string> {
  const next = new Set(current)
  if (next.has(selectionKey)) next.delete(selectionKey)
  else next.add(selectionKey)
  return next
}

export function toggleSectionSelection(
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

export function groupSelectionKeysByResource(
  selectedKeys: Set<string>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const key of selectedKeys) {
    const parsed = parseKnowledgeSelectionKey(key)
    if (!parsed) continue
    const bucket = grouped.get(parsed.resourceId) ?? []
    bucket.push(parsed.documentId)
    grouped.set(parsed.resourceId, bucket)
  }
  return grouped
}

export function collectAllSectionKeys(sectionKeysMap: Record<string, string[]>): Set<string> {
  const next = new Set<string>()
  for (const keys of Object.values(sectionKeysMap)) {
    for (const key of keys) next.add(key)
  }
  return next
}

export function removeSelectionKeysForResource(
  keys: Set<string>,
  resourceId: string,
): Set<string> {
  const next = new Set(keys)
  for (const key of keys) {
    if (key.startsWith(`${resourceId}:`)) next.delete(key)
  }
  return next
}

export function removeSelectionKeysForDocumentGroups(
  keys: Set<string>,
  groups: Array<{ resourceId: string; documentIds: string[] }>,
): Set<string> {
  const next = new Set(keys)
  for (const group of groups) {
    for (const documentId of group.documentIds) {
      next.delete(knowledgeSelectionKey(group.resourceId, documentId))
    }
  }
  return next
}

export function removeSavedDocumentOverrides(
  overrides: Record<string, Record<string, SavedDocumentOverride>>,
  savedGroups: Array<{ resourceId: string; savedDocumentIds: string[] }>,
): Record<string, Record<string, SavedDocumentOverride>> {
  const next = { ...overrides }
  for (const group of savedGroups) {
    const resourceOverrides = { ...next[group.resourceId] }
    for (const documentId of group.savedDocumentIds) {
      delete resourceOverrides[documentId]
    }
    if (Object.keys(resourceOverrides).length === 0) {
      delete next[group.resourceId]
    } else {
      next[group.resourceId] = resourceOverrides
    }
  }
  return next
}

export function updateSavedDocRegistry(
  current: Record<string, GroupKnowledgeSavedDocumentRegistry>,
  resourceId: string,
  registry: GroupKnowledgeSavedDocumentRegistry | null,
): Record<string, GroupKnowledgeSavedDocumentRegistry> {
  const next = { ...current }
  if (registry) {
    next[resourceId] = registry
  } else {
    delete next[resourceId]
  }
  return next
}

export function canDeleteAnySelectedKey(
  selectedKeys: Set<string>,
  sharedResources: P2pSharedResource[],
  canDeleteResource: (resource: { sharedBy: string }) => boolean,
  savedDocRegistry: Record<string, GroupKnowledgeSavedDocumentRegistry>,
): boolean {
  if (selectedKeys.size === 0) return false
  for (const key of selectedKeys) {
    const parsed = parseKnowledgeSelectionKey(key)
    if (!parsed) continue
    const resource = sharedResources.find((item) => item.id === parsed.resourceId)
    if (resource && canDeleteResource(resource)) return true
    const savedIds = resolveSavedDocumentIds(savedDocRegistry[parsed.resourceId], [
      parsed.documentId,
    ])
    if (savedIds.length > 0) return true
  }
  return false
}

export function buildSavedGroupsFromEntries(
  entries: Array<{ resourceId: string; documentIds: string[] }>,
  savedDocRegistry: Record<string, GroupKnowledgeSavedDocumentRegistry>,
): Array<{
  resourceId: string
  workspaceId: string
  savedKbId: string
  savedDocumentIds: string[]
}> {
  return entries.flatMap((entry) => {
    const registry = savedDocRegistry[entry.resourceId]
    if (!registry) return []
    const savedDocumentIds = resolveSavedDocumentIds(registry, entry.documentIds)
    if (savedDocumentIds.length === 0) return []
    return [
      {
        resourceId: entry.resourceId,
        workspaceId: registry.workspaceId,
        savedKbId: registry.savedKbId,
        savedDocumentIds,
      },
    ]
  })
}

export function partitionDeleteEntries(
  grouped: Map<string, string[]>,
  sharedResources: P2pSharedResource[],
  canDeleteResource: (resource: { sharedBy: string }) => boolean,
): {
  groupRemoveEntries: Array<{ resourceId: string; documentIds: string[] }>
  savedRemoveEntries: Array<{ resourceId: string; documentIds: string[] }>
} {
  const groupRemoveEntries: Array<{ resourceId: string; documentIds: string[] }> = []
  const savedRemoveEntries: Array<{ resourceId: string; documentIds: string[] }> = []

  for (const [resourceId, documentIds] of grouped.entries()) {
    const resource = sharedResources.find((item) => item.id === resourceId)
    if (resource && canDeleteResource(resource)) {
      groupRemoveEntries.push({ resourceId, documentIds })
    } else {
      savedRemoveEntries.push({ resourceId, documentIds })
    }
  }

  return { groupRemoveEntries, savedRemoveEntries }
}

export function buildDocumentRemovePreview(documentIds: string[]): {
  preview: string
  suffix: string
} {
  const suffix =
    documentIds.length > 2
      ? ` 等 ${documentIds.length} 个文件`
      : documentIds.length > 1
        ? ''
        : ''
  const preview =
    documentIds.length > 2
      ? `${documentIds.length} 个文件`
      : `${documentIds.length} 个共享文件`
  return { preview, suffix }
}

export function buildSavedDocumentRemovePreview(count: number): string {
  return count > 2 ? `${count} 个已保存文件` : `${count} 个已保存文件`
}

export function resolveConfirmDeleteTitle(
  kind: PendingDeleteKind,
  labels: { kb: string; saved: string; shared: string },
): string {
  if (kind === 'kb') return labels.kb
  if (kind === 'saved-documents' || kind === 'saved-section') return labels.saved
  return labels.shared
}
