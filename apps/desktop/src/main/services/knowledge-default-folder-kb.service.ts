import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import {
  KnowledgeDefaultFolderEnsureKbInputSchema,
  KnowledgeDefaultFolderEnsureKbOutputSchema,
  KnowledgeWatchConfigSchema,
} from '@toolman/shared'
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from './knowledge.service'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
} from './knowledge-folder.service'
import { normalizeFolderPath } from './toolman-user-documents.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { restartKnowledgeWatchersForKb } from './knowledge-watcher.service'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'

const DEFAULT_FOLDER_KB_NAMES = {
  local: '默认文件夹',
  network: '默认网络文件夹',
  local_files: '默认本地文件',
} as const

const SYSTEM_KB_NAMES = new Set(Object.values(DEFAULT_FOLDER_KB_NAMES))

export function isSystemKnowledgeBase(kb: { name: string }): boolean {
  return SYSTEM_KB_NAMES.has(kb.name as (typeof DEFAULT_FOLDER_KB_NAMES)[keyof typeof DEFAULT_FOLDER_KB_NAMES])
}

function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

function migrateSystemKnowledgeBaseStorageLayout(
  workspaceId: string,
  kbId: string,
  baseFolder: string,
  subfolderName: string,
): void {
  const newStoragePath = join(baseFolder, subfolderName)
  if (normalizeFolderPath(baseFolder) === normalizeFolderPath(newStoragePath)) {
    return
  }

  mkdirSync(newStoragePath, { recursive: true })

  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()

  for (const doc of docRepo.listByKb(kbId)) {
    if (!doc.absolutePath) continue
    const resolved = resolve(doc.absolutePath)
    const root = resolve(baseFolder)
    if (!isPathInsideFolder(root, resolved)) continue

    const rel = relative(root, resolved)
    if (rel === subfolderName || rel.startsWith(`${subfolderName}${sep}`)) continue
    if (rel.includes(sep)) continue

    const dest = join(newStoragePath, basename(resolved))
    if (
      existsSync(resolved) &&
      normalizeFolderPath(resolved) !== normalizeFolderPath(dest) &&
      !existsSync(dest)
    ) {
      try {
        renameSync(resolved, dest)
      } catch {
        continue
      }
    }
    if (existsSync(dest)) {
      docRepo.update(doc.id, kbId, { absolutePath: dest })
    }
  }

  const kb = kbRepo.findRowById(kbId, workspaceId)
  if (kb) {
    try {
      const parsed = KnowledgeWatchConfigSchema.parse(JSON.parse(kb.watchConfigJson))
      let changed = false
      const paths = parsed.paths?.map((path) => {
        if (normalizeFolderPath(path) === normalizeFolderPath(baseFolder)) {
          changed = true
          return newStoragePath
        }
        return path
      })
      if (changed) {
        kbRepo.update({
          id: kbId,
          workspaceId,
          watchConfigJson: JSON.stringify({ ...parsed, paths }),
        })
      }
    } catch {
      // ignore invalid watch config
    }
  }
}

export function ensureDefaultFolderKnowledgeBase(input: unknown) {
  const data = KnowledgeDefaultFolderEnsureKbInputSchema.parse(input)
  const name = DEFAULT_FOLDER_KB_NAMES[data.kind]
  const folderPath =
    data.kind === 'network'
      ? ensureWorkspaceNetworkKnowledgeFolder({ workspaceId: data.workspaceId })
      : data.kind === 'local_files'
        ? ensureWorkspaceLocalFilesFolder({ workspaceId: data.workspaceId })
        : ensureWorkspaceKnowledgeFolder({ workspaceId: data.workspaceId })

  const items = listKnowledgeBases({ workspaceId: data.workspaceId })
  const existing =
    items.find((item) => item.name === name && item.kind === data.kind) ??
    items.find((item) => item.name === name)
  const kb = existing ?? createKnowledgeBase({
    workspaceId: data.workspaceId,
    name,
    description:
      data.kind === 'network'
        ? '默认网络文件夹知识库'
        : data.kind === 'local_files'
          ? '默认本地文件存储'
          : '默认文件夹知识库',
    kind: data.kind,
  })

  migrateSystemKnowledgeBaseStorageLayout(data.workspaceId, kb.id, folderPath, name)

  const storagePath = resolveKnowledgeBaseStoragePath(
    { workspaceId: data.workspaceId, name: kb.name, kind: kb.kind, description: kb.description },
    { ensure: true },
  )
  if (storagePath) {
    ensureKnowledgeBaseStorageSource(data.workspaceId, kb.id, storagePath)
    restartKnowledgeWatchersForKb(data.workspaceId, kb.id)
  }

  return KnowledgeDefaultFolderEnsureKbOutputSchema.parse({
    kb,
    folderPath: storagePath ?? join(folderPath, name),
  })
}
