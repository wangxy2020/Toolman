import type { P2pMember, P2pMemberRole, P2pSharedResource } from '@toolman/shared'
import { canEditSharedResource } from '@toolman/shared'
import type { GroupNoteListItem } from './GroupSharedNotebookSection'
import {
  resolveSharedNoteNotebookKey,
  resolveSharedNoteNotebookName,
} from './group-note-utils'
import { groupResourcesByMember } from './group-shared-resources-by-member'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'
import { UNKNOWN_NOTEBOOK_ID } from './group-notes-panel-types'

export function canDeleteGroupNoteResource(
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

export function canEditGroupNoteResource(
  resource: P2pSharedResource,
  selfMemberRole: P2pMemberRole | null,
  selfMemberId: string | null,
): boolean {
  return canEditSharedResource(selfMemberRole ?? undefined, selfMemberId, {
    permission: resource.permission,
    sharedBy: resource.sharedBy,
  })
}

export function toggleNoteSelection(current: Set<string>, resourceId: string): Set<string> {
  const next = new Set(current)
  if (next.has(resourceId)) next.delete(resourceId)
  else next.add(resourceId)
  return next
}

export function toggleNoteSectionSelection(
  current: Set<string>,
  resourceIds: string[],
): Set<string> {
  const allSelected = resourceIds.length > 0 && resourceIds.every((id) => current.has(id))
  const next = new Set(current)
  if (allSelected) {
    for (const id of resourceIds) next.delete(id)
  } else {
    for (const id of resourceIds) next.add(id)
  }
  return next
}

export function collectAllResourceIds(sectionKeysMap: Record<string, string[]>): Set<string> {
  const next = new Set<string>()
  for (const ids of Object.values(sectionKeysMap)) {
    for (const id of ids) next.add(id)
  }
  return next
}

export interface MemberNotebookSection {
  memberId: string
  displayName: string
  isSelf: boolean
  notebookSections: Array<{
    sectionKey: string
    notebookId: string
    name: string
    items: GroupNoteListItem[]
  }>
}

export function buildMemberNotebookSections(
  sharedResources: P2pSharedResource[],
  members: P2pMember[],
  selfMemberId: string | null,
  notebooks: NotebookItem[],
  notesById: Map<string, NoteItem>,
  notebooksById: Map<string, NotebookItem>,
  unknownMemberLabel: string,
  unknownNotebookLabel: string,
): MemberNotebookSection[] {
  const memberGroups = groupResourcesByMember(
    sharedResources,
    members,
    selfMemberId,
    unknownMemberLabel,
  )
  const notebookOrder = new Map(notebooks.map((item, index) => [item.id, index]))

  return memberGroups.map((memberSection) => {
    const groups = new Map<string, GroupNoteListItem[]>()

    for (const resource of memberSection.resources) {
      const noteId = resource.localResourceId ?? resource.id
      const note = notesById.get(noteId) ?? null
      const notebookId = resolveSharedNoteNotebookKey(resource, note) || UNKNOWN_NOTEBOOK_ID
      const sectionKey = `${memberSection.memberId}:${notebookId}`
      const bucket = groups.get(sectionKey) ?? []
      bucket.push({ resource, note })
      groups.set(sectionKey, bucket)
    }

    const notebookSections = [...groups.entries()]
      .map(([sectionKey, items]) => {
        const notebookId = sectionKey.slice(memberSection.memberId.length + 1)
        const sortedItems = [...items].sort((left, right) => {
          const leftUpdated = left.note?.updatedAt ?? left.resource.updatedAt
          const rightUpdated = right.note?.updatedAt ?? right.resource.updatedAt
          return rightUpdated - leftUpdated
        })

        const name =
          notebookId === UNKNOWN_NOTEBOOK_ID
            ? unknownNotebookLabel
            : resolveSharedNoteNotebookName(
                items[0]?.resource ?? { notebookId, notebookName: undefined },
                notebookId,
                notebooksById,
              )

        return { sectionKey, notebookId, name, items: sortedItems }
      })
      .sort((left, right) => {
        const leftOrder = notebookOrder.get(left.notebookId) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = notebookOrder.get(right.notebookId) ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        return left.name.localeCompare(right.name, 'zh-CN')
      })

    return { ...memberSection, notebookSections }
  })
}

export function buildNoteDeletePreview(
  resourceIds: string[],
  sharedResources: P2pSharedResource[],
  notesById: Map<string, NoteItem>,
): { preview: string; suffix: string } {
  const names = resourceIds
    .map((id) => {
      const resource = sharedResources.find((item) => item.id === id)
      const noteId = resource?.localResourceId ?? resource?.id
      return notesById.get(noteId ?? '')?.title ?? resource?.name
    })
    .filter(Boolean)
  const preview = names.slice(0, 2).join('、')
  const suffix = names.length > 2 ? ` 等 ${names.length} 篇笔记` : names.length > 1 ? '' : ''
  return { preview, suffix }
}

export function resolveNotebookNameForDelete(
  notebookId: string,
  sharedResources: P2pSharedResource[],
  notesById: Map<string, NoteItem>,
  notebooksById: Map<string, NotebookItem>,
): string {
  const sampleResource = sharedResources.find((resource) => {
    const noteId = resource.localResourceId ?? resource.id
    const note = notesById.get(noteId) ?? null
    return (resolveSharedNoteNotebookKey(resource, note) || UNKNOWN_NOTEBOOK_ID) === notebookId
  })
  return notebookId === UNKNOWN_NOTEBOOK_ID
    ? '未知笔记本'
    : resolveSharedNoteNotebookName(
        sampleResource ?? { notebookId, notebookName: undefined },
        notebookId,
        notebooksById,
      )
}
