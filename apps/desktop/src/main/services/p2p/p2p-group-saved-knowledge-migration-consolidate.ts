import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  buildP2pGroupSavedKnowledgeDescription,
  buildP2pGroupSavedKnowledgeDisplayName,
  isP2pSharedKnowledgeMirrorDescription,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from '@toolman/shared'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../../db/repos'
import { deleteKnowledgeBase } from '../knowledge.service'
import { ensureWorkspaceSharedKnowledgeFolder } from '../knowledge-folder.service'
import { resolveKnowledgeBaseStoragePath } from '../knowledge-kb-storage-path.service'
import {
  collectLegacyStoragePaths,
  ingestMissingFilesInStoragePath,
} from './p2p-group-saved-knowledge-migration-recover'
import {
  migrateDocumentsInKbToStoragePath,
  moveFileIfNeeded,
  moveRootLevelFiles,
  removeEmptyDirectory,
} from './p2p-group-saved-knowledge-migration-fs'

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
