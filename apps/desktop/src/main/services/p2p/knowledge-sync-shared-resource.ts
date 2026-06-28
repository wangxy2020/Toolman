import { P2pSharedResourceRepository, type P2pSharedResourceRow } from '@toolman/db'
import type { P2pSharedResource } from '@toolman/shared'
import { parseP2pNoteShareMetadata } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { mapP2pAgentSharedResourceRow } from './agent-share.service'
import { readKnowledgeShareMetadata } from './p2p-knowledge-share-metadata'

export function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function mapSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  if (row.resourceType === 'Agent') {
    return mapP2pAgentSharedResourceRow(row)
  }

  const base: P2pSharedResource = {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version ?? 1,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }

  if (row.resourceType === 'Note') {
    const meta = parseP2pNoteShareMetadata(row.metadataJson)
    if (!meta) {
      return base
    }
    return {
      ...base,
      notebookId: meta.notebookId,
      notebookName: meta.notebookName,
    }
  }

  if (row.resourceType !== 'Knowledge') {
    return base
  }

  const metadata = readKnowledgeShareMetadata(row.metadataJson)
  return {
    ...base,
    sharedDocumentIds: metadata.documentIds,
    sharedDocumentPermissions: metadata.documentPermissions,
    sourceWorkspaceId: metadata.sourceWorkspaceId,
    sourceKbKind: metadata.sourceKbKind,
  }
}
