import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import {
  P2pMemberRepository,
  P2pSharedResourceRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { deleteKnowledgeBase } from '../knowledge.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { normalizeFolderPath } from '../toolman-user-documents.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { removeEmptyDirectory } from './p2p-group-saved-knowledge-migration-fs'

export function collectLegacyStoragePaths(
  sharedRoot: string,
  rowName: string,
  meta: { groupName: string; sharedFolderName?: string },
): string[] {
  const paths = new Set<string>()
  paths.add(join(sharedRoot, rowName))
  paths.add(join(sharedRoot, meta.groupName))
  if (meta.sharedFolderName) {
    paths.add(join(sharedRoot, meta.groupName, meta.sharedFolderName))
  }
  return [...paths]
}

export async function ingestMissingFilesInStoragePath(
  storageWorkspaceId: string,
  kbId: string,
  storagePath: string,
): Promise<number> {
  if (!existsSync(storagePath)) return 0

  const docRepo = getDocumentRepository()
  const existingPaths = new Set(
    docRepo
      .listByKb(kbId)
      .map((doc) => (doc.absolutePath ? normalizeFolderPath(doc.absolutePath) : ''))
      .filter(Boolean),
  )

  const { ingestFileAtPath, purgeIgnoredKnowledgeDocuments } = await import(
    '../knowledge-ingest.service'
  )
  const { isIgnoredKnowledgeIngestFile } = await import('@toolman/knowledge')

  let ingested = 0
  for (const entry of readdirSync(storagePath)) {
    const filePath = join(storagePath, entry)
    if (!statSync(filePath).isFile()) continue
    if (isIgnoredKnowledgeIngestFile(filePath)) continue
    const normalized = normalizeFolderPath(filePath)
    if (existingPaths.has(normalized)) continue

    const result = await ingestFileAtPath({
      workspaceId: storageWorkspaceId,
      kbId,
      filePath,
      skipP2pSync: true,
    })
    if (result.outcome !== 'failed') {
      ingested += 1
    }
  }

  purgeIgnoredKnowledgeDocuments(storageWorkspaceId, kbId)

  return ingested
}

function upgradeGroupSavedKnowledgeWorkspaceIds(storageWorkspaceId: string): number {
  const kbRepo = getKnowledgeBaseRepository()
  const memberRepo = new P2pMemberRepository(getDatabase())
  const p2pWorkspaceRepo = new P2pWorkspaceRepository(getDatabase())
  const deviceId = getP2pDeviceInfo().deviceId
  let upgraded = 0

  const p2pWorkspaces = memberRepo
    .listActiveMembershipsByDevice(deviceId)
    .map((membership) => p2pWorkspaceRepo.findById(membership.workspaceId))
    .filter((workspace): workspace is NonNullable<typeof workspace> => workspace != null)

  for (const row of kbRepo.listByWorkspace(storageWorkspaceId)) {
    const meta = parseP2pGroupSavedKnowledgeMeta(row.description)
    if (!meta || row.kind !== 'shared' || meta.p2pWorkspaceId) continue

    const match = p2pWorkspaces.find((workspace) => workspace.name === meta.groupName)
    if (!match) continue

    kbRepo.update({
      id: row.id,
      workspaceId: storageWorkspaceId,
      name: buildP2pGroupSavedKnowledgeDisplayName(match.name),
      description: buildP2pGroupSavedKnowledgeDescription({
        groupName: match.name,
        p2pWorkspaceId: match.id,
      }),
    })
    upgraded += 1
  }

  return upgraded
}

async function recoverGroupSavedKnowledgeFromDisk(storageWorkspaceId: string): Promise<number> {
  const kbRepo = getKnowledgeBaseRepository()
  const docRepo = getDocumentRepository()
  const memberRepo = new P2pMemberRepository(getDatabase())
  const p2pWorkspaceRepo = new P2pWorkspaceRepository(getDatabase())
  const sharedRepo = new P2pSharedResourceRepository(getDatabase())
  const deviceId = getP2pDeviceInfo().deviceId
  let recovered = 0

  const memberships = memberRepo.listActiveMembershipsByDevice(deviceId)
  for (const membership of memberships) {
    const p2pWorkspace = p2pWorkspaceRepo.findById(membership.workspaceId)
    if (!p2pWorkspace) continue

    const selfMember = memberRepo.findByWorkspaceAndDevice(p2pWorkspace.id, deviceId)
    const workspaceRows = kbRepo.listByWorkspace(storageWorkspaceId)
    const existingId = findGroupSavedKnowledgeBaseId(
      workspaceRows,
      {
        p2pWorkspaceId: p2pWorkspace.id,
        groupName: p2pWorkspace.name,
      },
      { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
    )

    if (!existingId) {
      continue
    }

    const kbRow = kbRepo.findRowById(existingId, storageWorkspaceId)
    if (!kbRow) continue

    const storagePath = resolveKnowledgeBaseStoragePath(kbRow, { ensure: false })
    if (!storagePath) continue

    recovered += await ingestMissingFilesInStoragePath(
      storageWorkspaceId,
      existingId,
      storagePath,
    )

    const hasExternalShare = sharedRepo.listByWorkspace(p2pWorkspace.id).some((resource) => {
      if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') return false
      if (!selfMember) return true
      return resource.sharedBy !== selfMember.id
    })

    if (!hasExternalShare && docRepo.listByKb(existingId).length === 0) {
      await deleteKnowledgeBase({ workspaceId: storageWorkspaceId, id: existingId })
      removeEmptyDirectory(storagePath)
    }
  }

  return recovered
}

async function purgeIgnoredGroupSavedKnowledgeDocuments(storageWorkspaceId: string): Promise<void> {
  const kbRepo = getKnowledgeBaseRepository()
  const { purgeIgnoredKnowledgeDocuments } = await import('../knowledge-ingest.service')

  for (const row of kbRepo.listByWorkspace(storageWorkspaceId)) {
    if (row.kind !== 'shared' || isP2pSharedKnowledgeMirrorDescription(row.description)) {
      continue
    }
    purgeIgnoredKnowledgeDocuments(storageWorkspaceId, row.id)
  }
}

export async function migrateAllLegacyGroupSavedKnowledgeBases(): Promise<{
  migratedKbCount: number
  upgradedKbCount: number
  recoveredDocCount: number
}> {
  const kbRepo = getKnowledgeBaseRepository()
  const workspaceIds = new Set<string>()
  for (const row of kbRepo.listAllActive()) {
    workspaceIds.add(row.workspaceId)
  }

  const { migrateLegacyGroupSavedKnowledgeBases } = await import(
    './p2p-group-saved-knowledge-migration-consolidate'
  )

  let migratedKbCount = 0
  let upgradedKbCount = 0
  let recoveredDocCount = 0
  for (const workspaceId of workspaceIds) {
    migratedKbCount += await migrateLegacyGroupSavedKnowledgeBases(workspaceId)
    upgradedKbCount += upgradeGroupSavedKnowledgeWorkspaceIds(workspaceId)
    recoveredDocCount += await recoverGroupSavedKnowledgeFromDisk(workspaceId)
    await purgeIgnoredGroupSavedKnowledgeDocuments(workspaceId)
  }

  return { migratedKbCount, upgradedKbCount, recoveredDocCount }
}
