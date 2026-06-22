import { basename, dirname, extname, join } from 'node:path'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import {
  P2pFileVersionRepository,
  P2pSharedResourceRepository,
  type P2pFileVersionRow,
  type P2pSharedResourceRow,
} from '@toolman/db'
import type {
  P2pFileListItem,
  P2pFileListSortBy,
  P2pFileVersion,
  P2pSharedResource,
  P2pSortOrder,
  WorkspaceEvent,
} from '@toolman/shared'
import {
  P2pFileDownloadInputSchema,
  P2pFileListInputSchema,
  P2pFileListVersionsInputSchema,
  P2pFileUploadInputSchema,
  P2pResourceUnshareInputSchema,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { blobExists, readBlobBytes, writeBlobFromPath } from '../blob.service'
import { appendP2pEvent } from './p2p-event.service'
import {
  assertCanDeleteFile,
  assertCanUploadFiles,
  assertWorkspaceMemberAccess,
} from './p2p-permission.guard'
import {
  fetchBlobFromPeers,
  pushBlobToPeers,
} from './p2p-blob-transfer.service'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getFileVersionRepo(): P2pFileVersionRepository {
  return new P2pFileVersionRepository(getDatabase())
}

function mapSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function readMetadataMimeType(row: P2pSharedResourceRow): string | undefined {
  try {
    const metadata = JSON.parse(row.metadataJson) as { mimeType?: string }
    return typeof metadata.mimeType === 'string' ? metadata.mimeType : undefined
  } catch {
    return undefined
  }
}

function toListItem(
  resource: P2pSharedResourceRow,
  versionRow: P2pFileVersionRow | null,
): P2pFileListItem {
  return {
    resourceId: resource.id,
    name: resource.name,
    mimeType: versionRow?.mimeType ?? readMetadataMimeType(resource),
    sizeBytes: versionRow?.sizeBytes ?? 0,
    contentHash: versionRow?.contentHash ?? resource.contentHash ?? '',
    version: versionRow?.version ?? resource.version,
    uploadedBy: versionRow?.uploadedBy ?? resource.sharedBy,
    sharedBy: resource.sharedBy,
    updatedAt: resource.updatedAt.getTime(),
  }
}

function sortFiles(
  files: P2pFileListItem[],
  sortBy: P2pFileListSortBy,
  order: P2pSortOrder,
): P2pFileListItem[] {
  const direction = order === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name, 'zh-CN') * direction
      case 'size':
        return (a.sizeBytes - b.sizeBytes) * direction
      case 'updated_at':
      default:
        return (a.updatedAt - b.updatedAt) * direction
    }
  })
}

export async function uploadP2pFile(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
  version: number
  contentHash: string
  event: WorkspaceEvent
}> {
  const input = P2pFileUploadInputSchema.parse(rawInput)
  const member = assertCanUploadFiles(input.workspaceId)
  const blob = writeBlobFromPath(input.filePath)
  const displayName = input.name?.trim() || basename(input.filePath)

  const duplicate = getSharedResourceRepo()
    .listFilesByWorkspace(input.workspaceId)
    .find((item) => item.contentHash === blob.hash)
  if (duplicate) {
    throw new Error('该文件已存在于群组中')
  }

  const resourceId = randomUUID()
  const now = new Date()

  const resourceRow = getSharedResourceRepo().create({
    id: resourceId,
    workspaceId: input.workspaceId,
    resourceType: 'File',
    name: displayName,
    sharedBy: member.id,
    permission: member.role === 'owner' || member.role === 'admin' ? 'admin' : 'write',
    metadataJson: JSON.stringify({
      mimeType: blob.mimeType,
      originalName: blob.originalName ?? displayName,
    }),
    contentHash: blob.hash,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })

  const event = await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'File',
    resourceId: resourceRow.id,
    operatorId: member.id,
    eventType: 'Created',
    payload: {
      name: displayName,
      file_name: displayName,
      content_hash: blob.hash,
      size_bytes: blob.sizeBytes,
      mime_type: blob.mimeType,
      version: 1,
      shared_resource_id: resourceRow.id,
    },
  })

  getFileVersionRepo().create({
    workspaceId: input.workspaceId,
    sharedResourceId: resourceRow.id,
    version: 1,
    contentHash: blob.hash,
    sizeBytes: blob.sizeBytes,
    mimeType: blob.mimeType,
    uploadedBy: member.id,
    eventId: event.eventId,
    createdAt: now,
  })

  void pushBlobToPeers(input.workspaceId, blob.hash, blob.mimeType)

  return {
    sharedResource: mapSharedResourceRow(resourceRow),
    version: 1,
    contentHash: blob.hash,
    event,
  }
}

export function listP2pFiles(rawInput: unknown): { files: P2pFileListItem[] } {
  const input = P2pFileListInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)

  const sortBy = input.sortBy ?? 'updated_at'
  const order = input.order ?? 'desc'
  const resources = getSharedResourceRepo().listFilesByWorkspace(input.workspaceId)
  const files = resources.map((resource) =>
    toListItem(resource, getFileVersionRepo().findLatestByResource(resource.id)),
  )

  return {
    files: sortFiles(files, sortBy, order),
  }
}

function mapVersionRow(row: P2pFileVersionRow): P2pFileVersion {
  return {
    version: row.version,
    contentHash: row.contentHash,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.getTime(),
  }
}

export function listP2pFileVersions(rawInput: unknown): { versions: P2pFileVersion[] } {
  const input = P2pFileListVersionsInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)

  const resource = getSharedResourceRepo().findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId || resource.resourceType !== 'File') {
    throw new Error('文件不存在')
  }

  const versions = getFileVersionRepo()
    .listByResource(input.resourceId)
    .map(mapVersionRow)

  return { versions }
}

function buildDownloadFileName(name: string, version: number, latestVersion: number): string {
  if (version >= latestVersion) {
    return name
  }

  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  return `${stem}_v${version}${extension}`
}

function resolveDownloadPath(destPath: string | undefined, fileName: string): string {
  if (!destPath) {
    return join(app.getPath('downloads'), fileName)
  }

  if (existsSync(destPath) && statSync(destPath).isDirectory()) {
    return join(destPath, fileName)
  }

  if (!extname(basename(destPath))) {
    return join(destPath, fileName)
  }

  return destPath
}

export async function downloadP2pFile(rawInput: unknown): Promise<{
  path: string
  contentHash: string
  sizeBytes: number
}> {
  const input = P2pFileDownloadInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.workspaceId)

  const resource = getSharedResourceRepo().findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId || resource.resourceType !== 'File') {
    throw new Error('文件不存在')
  }

  const versionRow = input.version
    ? getFileVersionRepo().findByResourceVersion(input.resourceId, input.version)
    : getFileVersionRepo().findLatestByResource(input.resourceId)

  if (!versionRow) {
    throw new Error('文件版本不存在')
  }

  if (!blobExists(versionRow.contentHash)) {
    const fetched = await fetchBlobFromPeers(
      input.workspaceId,
      versionRow.contentHash,
      versionRow.mimeType ?? readMetadataMimeType(resource),
    )
    if (!fetched || !blobExists(versionRow.contentHash)) {
      throw new Error('文件内容暂不可下载')
    }
  }

  const data = readBlobBytes(versionRow.contentHash)
  const fileName = buildDownloadFileName(resource.name, versionRow.version, resource.version)
  const targetPath = resolveDownloadPath(input.destPath, fileName)
  const parentDir = dirname(targetPath)

  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true })
  }

  writeFileSync(targetPath, data)

  return {
    path: targetPath,
    contentHash: versionRow.contentHash,
    sizeBytes: versionRow.sizeBytes,
  }
}

export async function deleteP2pFile(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId || resource.resourceType !== 'File') {
    throw new Error('文件不存在')
  }

  const member = assertCanDeleteFile(
    input.workspaceId,
    resource.sharedBy,
    getFileVersionRepo().findLatestByResource(resource.id)?.uploadedBy,
  )

  sharedRepo.update({ id: resource.id, status: 'unshared' })

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'File',
    resourceId: resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      name: resource.name,
      shared_resource_id: resource.id,
    },
  })

  return { unshared: true }
}
