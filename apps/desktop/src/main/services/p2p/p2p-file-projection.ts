import {
  P2pFileVersionRepository,
  P2pSharedResourceRepository,
} from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { scheduleBlobFetch } from './p2p-blob-transfer.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getFileVersionRepo(): P2pFileVersionRepository {
  return new P2pFileVersionRepository(getDatabase())
}

export function projectFileDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'File' || event.eventType !== 'Deleted') {
    return
  }

  const sharedResourceRepo = getSharedResourceRepo()
  const resource = sharedResourceRepo.findById(event.resourceId)
  if (!resource || resource.status === 'unshared') {
    return
  }

  sharedResourceRepo.update({ id: resource.id, status: 'unshared' })
}

export function projectFileCreatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'File' || event.eventType !== 'Created') {
    return
  }

  const sharedResourceRepo = getSharedResourceRepo()
  const fileVersionRepo = getFileVersionRepo()
  if (sharedResourceRepo.findById(event.resourceId)) {
    return
  }

  const payload = event.payload
  const name =
    typeof payload.name === 'string'
      ? payload.name
      : typeof payload.file_name === 'string'
        ? payload.file_name
        : '未命名文件'
  const contentHash = typeof payload.content_hash === 'string' ? payload.content_hash : null
  const sizeBytes = typeof payload.size_bytes === 'number' ? payload.size_bytes : 0
  const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type : undefined
  const version = typeof payload.version === 'number' ? payload.version : 1
  const createdAt = new Date(event.timestamp)

  sharedResourceRepo.create({
    id: event.resourceId,
    workspaceId: event.workspaceId,
    resourceType: 'File',
    name,
    sharedBy: event.operatorId,
    permission: 'read',
    metadataJson: JSON.stringify({ mimeType }),
    contentHash,
    version,
    createdAt,
    updatedAt: createdAt,
  })

  if (!fileVersionRepo.findByResourceVersion(event.resourceId, version)) {
    fileVersionRepo.create({
      workspaceId: event.workspaceId,
      sharedResourceId: event.resourceId,
      version,
      contentHash: contentHash ?? '',
      sizeBytes,
      mimeType,
      uploadedBy: event.operatorId,
      eventId: event.eventId,
      createdAt,
    })
  }

  scheduleBlobFetch(event.workspaceId, contentHash, mimeType)
}
