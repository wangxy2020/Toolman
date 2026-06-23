import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
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
import { deleteKnowledgeBase } from '../knowledge.service'
import { ensureWorkspaceSharedKnowledgeFolder } from '../knowledge-folder.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import { ensureKnowledgeBaseStorageSource } from '../knowledge-kb-storage-source.service'
import { restartKnowledgeWatchersForKb } from '../knowledge-watcher.service'
import { normalizeFolderPath } from '../toolman-user-documents.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

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

function removeEmptyDirectory(path: string): void {
  if (!existsSync(path)) return
  try {
    if (readdirSync(path).length === 0) {
      rmdirSync(path)
    }
  } catch {
    // ignore cleanup failure
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

function resolveLegacyGroupSavedMeta(row: {
  name: string
  description: string | null
}): ReturnType<typeof normalizeP2pGroupSavedKnowledgeMeta> | null {
  const parsed = parseP2pGroupSavedKnowledgeMeta(row.description)
  if (parsed) {
    return normalizeP2pGroupSavedKnowledgeMeta(
      parsed.groupName,
      undefined,
      parsed.p2pWorkspaceId,
    )
  }

  const bracketMatch = row.name.trim().match(/^\[([^\]]+)\]/)
  if (bracketMatch?.[1]) {
    return normalizeP2pGroupSavedKnowledgeMeta(bracketMatch[1])
  }

  const plainName = row.name.trim()
  if (!plainName) return null
  return normalizeP2pGroupSavedKnowledgeMeta(plainName)
}

function collectLegacyStoragePaths(
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

async function consolidateGroupSavedKnowledgeBases(workspaceId: string): Promise<number> {
  const kbRepo = getKnowledgeBaseRepository()
  const docRepo = getDocumentRepository()
  const sharedRoot = ensureWorkspaceSharedKnowledgeFolder({ workspaceId })
  let consolidated = 0

  const sharedRows = kbRepo
    .listByWorkspace(workspaceId)
    .filter(
      (row) => row.kind === 'shared' && !isP2pSharedKnowledgeMirrorDescription(row.description),
    )

  const groups = new Map<string, typeof sharedRows>()
  for (const row of sharedRows) {
    const meta = resolveLegacyGroupSavedMeta(row)
    if (!meta) continue
    const key = meta.p2pWorkspaceId ?? meta.groupName
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }

  for (const rows of groups.values()) {
    if (rows.length === 0) continue

    const canonicalMeta = resolveLegacyGroupSavedMeta(rows[0]!)
    if (!canonicalMeta) continue

    const displayName = buildP2pGroupSavedKnowledgeDisplayName(canonicalMeta.groupName)
    const description = buildP2pGroupSavedKnowledgeDescription(canonicalMeta)

    const primary =
      rows.find((row) => parseP2pGroupSavedKnowledgeMeta(row.description)?.p2pWorkspaceId) ??
      rows[0]!

    kbRepo.update({
      id: primary.id,
      workspaceId,
      name: displayName,
      description,
    })

    const targetStoragePath = resolveKnowledgeBaseStoragePath(
      {
        workspaceId,
        name: displayName,
        kind: 'shared',
        description,
      },
      { ensure: true },
    )
    if (!targetStoragePath) continue

    for (const row of rows) {
      for (const legacyPath of collectLegacyStoragePaths(sharedRoot, row.name, canonicalMeta)) {
        moveRootLevelFiles(legacyPath, targetStoragePath)
        removeEmptyDirectory(legacyPath)
      }
    }

    migrateDocumentsInKbToStoragePath(primary.id, workspaceId, targetStoragePath)

    for (const row of rows) {
      if (row.id === primary.id) continue
      for (const doc of docRepo.listByKb(row.id)) {
        if (!doc.absolutePath) continue
        moveFileIfNeeded(doc.absolutePath, join(targetStoragePath, basename(doc.absolutePath)))
      }
      await deleteKnowledgeBase({ workspaceId, id: row.id })
      consolidated += 1
    }

    await ingestMissingFilesInStoragePath(workspaceId, primary.id, targetStoragePath)

    if (docRepo.listByKb(primary.id).length === 0) {
      await deleteKnowledgeBase({ workspaceId, id: primary.id })
      removeEmptyDirectory(targetStoragePath)
      consolidated += 1
    }
  }

  if (existsSync(sharedRoot)) {
    for (const entry of readdirSync(sharedRoot)) {
      const entryPath = join(sharedRoot, entry)
      if (!statSync(entryPath).isDirectory()) continue
      if (entry.startsWith('[') || entry.includes('默认文件夹')) {
        const guessedGroup = entry
          .replace(/^\[([^\]]+)\].*$/, '$1')
          .replace(/默认文件夹$/, '')
          .trim()
        if (!guessedGroup) {
          removeEmptyDirectory(entryPath)
          continue
        }
        const target = join(sharedRoot, guessedGroup)
        moveRootLevelFiles(entryPath, target)
        removeEmptyDirectory(entryPath)
      }
    }
  }

  return consolidated
}

export async function migrateLegacyGroupSavedKnowledgeBases(workspaceId: string): Promise<number> {
  return consolidateGroupSavedKnowledgeBases(workspaceId)
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
    migratedKbCount += await migrateLegacyGroupSavedKnowledgeBases(workspaceId)
    upgradedKbCount += upgradeGroupSavedKnowledgeWorkspaceIds(workspaceId)
    recoveredDocCount += await recoverGroupSavedKnowledgeFromDisk(workspaceId)
    await purgeIgnoredGroupSavedKnowledgeDocuments(workspaceId)
  }

  return { migratedKbCount, upgradedKbCount, recoveredDocCount }
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
