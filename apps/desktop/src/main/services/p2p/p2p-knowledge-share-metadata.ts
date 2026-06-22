import type { P2pKnowledgeDocumentPermission, WorkspaceEvent } from '@toolman/shared'
import { listWorkspaceEventsSince } from './p2p-event.service'

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
