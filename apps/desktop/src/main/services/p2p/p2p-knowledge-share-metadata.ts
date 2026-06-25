import type { P2pKnowledgeDocumentPermission, WorkspaceEvent } from '@toolman/shared'
import { listWorkspaceEventsSince } from './p2p-event.service'

export interface KnowledgeShareMetadata {
  description?: string | null
  sourceWorkspaceId?: string
  documentIds?: string[]
  documentPermissions?: Record<string, P2pKnowledgeDocumentPermission>
}

export function readKnowledgeShareMetadata(metadataJson: string): KnowledgeShareMetadata {
  try {
    const parsed = JSON.parse(metadataJson) as KnowledgeShareMetadata & {
      documentPermissions?: Record<string, unknown>
    }
    const documentPermissions: Record<string, P2pKnowledgeDocumentPermission> = {}
    if (parsed.documentPermissions && typeof parsed.documentPermissions === 'object') {
      for (const [documentId, permission] of Object.entries(parsed.documentPermissions)) {
        if (permission === 'read' || permission === 'savable') {
          documentPermissions[documentId] = permission
        }
      }
    }
    return {
      description: parsed.description ?? null,
      sourceWorkspaceId:
        typeof parsed.sourceWorkspaceId === 'string' ? parsed.sourceWorkspaceId : undefined,
      documentIds: Array.isArray(parsed.documentIds)
        ? parsed.documentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined,
      documentPermissions:
        Object.keys(documentPermissions).length > 0 ? documentPermissions : undefined,
    }
  } catch {
    return {}
  }
}

export function buildKnowledgeShareMetadata(parts: KnowledgeShareMetadata): string {
  const payload: KnowledgeShareMetadata = {
    description: parts.description ?? null,
    sourceWorkspaceId: parts.sourceWorkspaceId,
  }
  if (parts.documentIds && parts.documentIds.length > 0) {
    payload.documentIds = parts.documentIds
  }
  if (parts.documentPermissions && Object.keys(parts.documentPermissions).length > 0) {
    payload.documentPermissions = parts.documentPermissions
  }
  return JSON.stringify(payload)
}

export function mergeSharedDocumentIds(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing
  }
  return [...new Set([...(existing ?? []), ...incoming])]
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

export function parseKnowledgeDocumentPermissionsFromPayload(
  payload: Record<string, unknown>,
): Record<string, P2pKnowledgeDocumentPermission> | undefined {
  const raw = payload.document_permissions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const documentPermissions: Record<string, P2pKnowledgeDocumentPermission> = {}
  for (const [documentId, permission] of Object.entries(raw)) {
    if (permission === 'read' || permission === 'savable') {
      documentPermissions[documentId] = permission
    }
  }
  return Object.keys(documentPermissions).length > 0 ? documentPermissions : undefined
}

export function findLatestKnowledgeDocumentContentEvent(
  workspaceId: string,
  kbId: string,
  documentId: string,
): WorkspaceEvent | null {
  let sinceSeq = 0
  let latest: WorkspaceEvent | null = null

  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Knowledge' || event.eventType !== 'Updated') continue
      if (readPayloadString(event.payload, 'kb_id') !== kbId) continue
      if (readPayloadString(event.payload, 'doc_id') !== documentId) continue
      if (!readPayloadString(event.payload, 'content_hash')) continue
      latest = event
    }

    if (batch.length < 200) break
  }

  return latest
}
