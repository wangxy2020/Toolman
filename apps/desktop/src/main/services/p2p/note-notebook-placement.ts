import {
  buildGroupNotebookId,
  isGroupNotebookId,
  parseGroupNotebookWorkspaceId,
} from '@toolman/shared'
import { P2pMemberRepository, P2pWorkspaceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import type { NotebookItem } from '../notes-data/types'

export function isLocalSharedResourceOwner(workspaceId: string, sharedBy: string): boolean {
  const member = new P2pMemberRepository(getDatabase()).findByWorkspaceAndDevice(
    workspaceId,
    getP2pDeviceInfo().deviceId,
  )
  return member?.id === sharedBy
}

export function resolveGroupNotebookName(workspaceId: string): string {
  const workspace = new P2pWorkspaceRepository(getDatabase()).findById(workspaceId)
  return workspace?.name?.trim() || '群组笔记'
}

export function ensureGroupNotebook(
  notebooks: NotebookItem[],
  workspaceId: string,
): NotebookItem[] {
  const id = buildGroupNotebookId(workspaceId)
  const name = resolveGroupNotebookName(workspaceId)
  return notebooks.some((item) => item.id === id)
    ? notebooks.map((item) => (item.id === id ? { ...item, name } : item))
    : [...notebooks, { id, name }]
}

export function resolveProjectedGroupNoteNotebookId(
  workspaceId: string,
  sharedBy: string,
  ownerNotebookId: string,
): string {
  if (isLocalSharedResourceOwner(workspaceId, sharedBy)) {
    return ownerNotebookId
  }
  return buildGroupNotebookId(workspaceId)
}

export function ensureNotebookForNote(
  notebooks: NotebookItem[],
  notebookId: string,
): NotebookItem[] {
  if (!isGroupNotebookId(notebookId)) {
    return notebooks
  }
  const workspaceId = parseGroupNotebookWorkspaceId(notebookId)
  if (!workspaceId) return notebooks
  return ensureGroupNotebook(notebooks, workspaceId)
}

export function preserveGroupNotebookId(
  existingNotebookId: string | undefined,
  incomingNotebookId: string,
): string {
  if (existingNotebookId && isGroupNotebookId(existingNotebookId)) {
    return existingNotebookId
  }
  return incomingNotebookId
}
