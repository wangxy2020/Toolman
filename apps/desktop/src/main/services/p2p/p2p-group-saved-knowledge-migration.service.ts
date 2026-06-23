import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import {
  P2pMemberRepository,
  P2pSharedResourceRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { ingestFileAtPath } from '../knowledge-ingest.service'
import { ensureWorkspaceSharedKnowledgeFolder } from '../knowledge-folder.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { normalizeFolderPath } from '../toolman-user-documents.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { stripGroupPrefixedName } from './p2p-group-resource-naming'

function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

function moveFileIfNeeded(sourcePath: string, destinationPath: string): boolean {
  if (
    !existsSync(sourcePath) ||
    normalizeFolderPath(sourcePath) === normalizeFolderPath(destinationPath)
  ) {
    return existsSync(destinationPath)
  }
  if (existsSync(destinationPath)) {
    return true
  }
  mkdirSync(resolve(destinationPath, '..'), { recursive: true })
  try {
    renameSync(sourcePath, destinationPath)
    return true
  } catch {
    return existsSync(destinationPath)
  }
}

function moveRootLevelFiles(sourceRoot: string, destinationRoot: string): void {
  if (!existsSync(sourceRoot)) return
  if (normalizeFolderPath(sourceRoot) === normalizeFolderPath(destinationRoot)) return

  mkdirSync(destinationRoot, { recursive: true })
  for (const entry of readdirSync(sourceRoot)) {
    const sourcePath = join(sourceRoot, entry)
    if (!statSync(sourcePath).isFile()) continue
    moveFileIfNeeded(sourcePath, join(destinationRoot, entry))
  }
}

function migrateDocumentsInKbToStoragePath(
  kbId: string,
  workspaceId: string,
  targetStoragePath: string,
): void {
  const docRepo = getDocumentRepository()
  mkdirSync(targetStoragePath, { recursive: true })

  for (const doc of docRepo.listByKb(kbId)) {
    if (!doc.absolutePath) continue
    const resolved = resolve(doc.absolutePath)
    if (isPathInsideFolder(targetStoragePath, resolved)) continue

    const dest = join(targetStoragePath, basename(resolved))
    if (moveFileIfNeeded(resolved, dest)) {
      docRepo.update(doc.id, kbId, { absolutePath: dest })
    }
  }

  ensureKnowledgeBaseStorageSource(workspaceId, kbId, targetStoragePath)
  restartKnowledgeWatchersForKb(workspaceId, kbId)
}

function isLegacyFlatGroupSavedKnowledgeBase(row: {
  name: string
  kind: string
  description: string | null
}): boolean {
  if (row.kind !== 'shared' || isP2pSharedKnowledgeMirrorDescription(row.description)) {
    return false
  }
  return parseP2pGroupSavedKnowledgeMeta(row.description) == null
}

function resolveLegacyGroupSavedMeta(row: {
  name: string
  description: string | null
}): { groupName: string; sharedFolderName: string } | null {
  const bracketMatch = row.name.trim().match(/^\[([^\]]+)\]\s+(.+)$/)
  if (bracketMatch) {
    return normalizeP2pGroupSavedKnowledgeMeta(bracketMatch[1] ?? '', bracketMatch[2] ?? '')
  }

  const plainName = row.name.trim()
  if (!plainName) return null
  return normalizeP2pGroupSavedKnowledgeMeta(plainName, '共享文件夹')
}

function collectLegacyStoragePaths(
  sharedRoot: string,
  rowName: string,
  meta: { groupName: string; sharedFolderName: string },
): string[] {
  const paths = new Set<string>()
  paths.add(join(sharedRoot, rowName))
  paths.add(join(sharedRoot, meta.groupName))
  paths.add(join(sharedRoot, meta.groupName, meta.sharedFolderName))
  return [...paths]
}

export function migrateLegacyGroupSavedKnowledgeBases(workspaceId: string): number {
  const kbRepo = getKnowledgeBaseRepository()
  const sharedRoot = ensureWorkspaceSharedKnowledgeFolder({ workspaceId })
  let migrated = 0

  for (const row of kbRepo.listByWorkspace(workspaceId)) {
    if (!isLegacyFlatGroupSavedKnowledgeBase(row)) continue

    const legacyMeta = resolveLegacyGroupSavedMeta(row)
    if (!legacyMeta) continue

    const displayName = buildP2pGroupSavedKnowledgeDisplayName(
      legacyMeta.groupName,
      legacyMeta.sharedFolderName,
    )
    const description = buildP2pGroupSavedKnowledgeDescription(legacyMeta)

    kbRepo.update({
      id: row.id,
      workspaceId,
      name: displayName,
      description,
    })

    const updated = kbRepo.findRowById(row.id, workspaceId)
    if (!updated) continue

    const targetStoragePath = resolveKnowledgeBaseStoragePath(updated, { ensure: true })
    if (!targetStoragePath) continue

    for (const legacyPath of collectLegacyStoragePaths(sharedRoot, row.name, legacyMeta)) {
      moveRootLevelFiles(legacyPath, targetStoragePath)
    }

    migrateDocumentsInKbToStoragePath(row.id, workspaceId, targetStoragePath)
    migrated += 1
  }

  for (const row of kbRepo.listByWorkspace(workspaceId)) {
    const meta = parseP2pGroupSavedKnowledgeMeta(row.description)
    if (!meta || row.kind !== 'shared' || isP2pSharedKnowledgeMirrorDescription(row.description)) {
      continue
    }

    const nestedLegacyPath = join(sharedRoot, meta.groupName, meta.sharedFolderName)
    const targetStoragePath = resolveKnowledgeBaseStoragePath(row, { ensure: true })
    if (!targetStoragePath) continue

    moveRootLevelFiles(nestedLegacyPath, targetStoragePath)
    migrateDocumentsInKbToStoragePath(row.id, workspaceId, targetStoragePath)
  }

  return migrated
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
      description: buildP2pGroupSavedKnowledgeDescription({
        ...meta,
        p2pWorkspaceId: match.id,
      }),
    })
    upgraded += 1
  }

  return upgraded
}

async function ingestMissingFilesInStoragePath(
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

  let ingested = 0
  for (const entry of readdirSync(storagePath)) {
    const filePath = join(storagePath, entry)
    if (!statSync(filePath).isFile()) continue
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

  return ingested
}

async function recoverGroupSavedKnowledgeFromDisk(storageWorkspaceId: string): Promise<number> {
  const kbRepo = getKnowledgeBaseRepository()
  const memberRepo = new P2pMemberRepository(getDatabase())
  const p2pWorkspaceRepo = new P2pWorkspaceRepository(getDatabase())
  const sharedRepo = new P2pSharedResourceRepository(getDatabase())
  const deviceId = getP2pDeviceInfo().deviceId
  let recovered = 0

  const memberships = memberRepo.listActiveMembershipsByDevice(deviceId)
  for (const membership of memberships) {
    const p2pWorkspace = p2pWorkspaceRepo.findById(membership.workspaceId)
    if (!p2pWorkspace) continue

    const workspaceRows = kbRepo.listByWorkspace(storageWorkspaceId)
    for (const resource of sharedRepo.listByWorkspace(p2pWorkspace.id)) {
      if (resource.resourceType !== 'Knowledge' || resource.status !== 'active') continue

      const sharedFolderName = stripGroupPrefixedName(p2pWorkspace.id, resource.name)
      const savedMeta = normalizeP2pGroupSavedKnowledgeMeta(
        p2pWorkspace.name,
        sharedFolderName,
        p2pWorkspace.id,
      )
      const existingId = findGroupSavedKnowledgeBaseId(
        workspaceRows,
        {
          p2pWorkspaceId: p2pWorkspace.id,
          groupName: p2pWorkspace.name,
          sharedFolderName,
        },
        { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
      )

      if (existingId) {
        const kbRow = kbRepo.findRowById(existingId, storageWorkspaceId)
        if (!kbRow) continue
        const storagePath = resolveKnowledgeBaseStoragePath(kbRow, { ensure: false })
        if (!storagePath) continue
        recovered += await ingestMissingFilesInStoragePath(
          storageWorkspaceId,
          existingId,
          storagePath,
        )
        continue
      }

      const displayName = buildP2pGroupSavedKnowledgeDisplayName(
        savedMeta.groupName,
        savedMeta.sharedFolderName,
      )
      const description = buildP2pGroupSavedKnowledgeDescription(savedMeta)
      const kbRow = kbRepo.create({
        workspaceId: storageWorkspaceId,
        name: displayName,
        kind: 'shared',
        description,
      })

      const storagePath = resolveKnowledgeBaseStoragePath(kbRow, { ensure: true })
      if (!storagePath) continue

      ensureKnowledgeBaseStorageSource(storageWorkspaceId, kbRow.id, storagePath)
      restartKnowledgeWatchersForKb(storageWorkspaceId, kbRow.id)

      const ingested = await ingestMissingFilesInStoragePath(
        storageWorkspaceId,
        kbRow.id,
        storagePath,
      )
      if (ingested === 0 && !existsSync(storagePath)) {
        continue
      }
      recovered += ingested > 0 ? ingested : 1
    }
  }

  return recovered
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

  let migratedKbCount = 0
  let upgradedKbCount = 0
  let recoveredDocCount = 0
  for (const workspaceId of workspaceIds) {
    migratedKbCount += migrateLegacyGroupSavedKnowledgeBases(workspaceId)
    upgradedKbCount += upgradeGroupSavedKnowledgeWorkspaceIds(workspaceId)
    recoveredDocCount += await recoverGroupSavedKnowledgeFromDisk(workspaceId)
  }

  return { migratedKbCount, upgradedKbCount, recoveredDocCount }
}
