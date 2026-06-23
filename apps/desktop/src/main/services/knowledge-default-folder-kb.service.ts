import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'node:fs'
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
  renameKnowledgeStorageFolder,
} from './knowledge-folder.service'
import { listWorkspaces } from './workspace.service'
import { normalizeFolderPath } from './toolman-user-documents.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { restartKnowledgeWatchersForKb } from './knowledge-watcher.service'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'

const DEFAULT_FOLDER_KB_NAME = '默认文件夹'

const LEGACY_DEFAULT_FOLDER_KB_NAMES = {
  network: '默认网络文件夹',
  local_files: '默认本地文件',
} as const

const DEFAULT_FOLDER_KB_NAMES = {
  local: DEFAULT_FOLDER_KB_NAME,
  network: DEFAULT_FOLDER_KB_NAME,
  local_files: DEFAULT_FOLDER_KB_NAME,
} as const

const SYSTEM_KB_NAMES = new Set([
  DEFAULT_FOLDER_KB_NAME,
  ...Object.values(LEGACY_DEFAULT_FOLDER_KB_NAMES),
])

export function isSystemKnowledgeBase(kb: { name: string }): boolean {
  return SYSTEM_KB_NAMES.has(kb.name)
}

function isPathInsideFolder(folderPath: string, filePath: string): boolean {
  const root = resolve(folderPath)
  const target = resolve(filePath)
  return target === root || target.startsWith(`${root}${sep}`)
}

function mergeFolderContents(sourceDir: string, destinationDir: string): void {
  if (!existsSync(sourceDir)) return
  mkdirSync(destinationDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry)
    const destinationPath = join(destinationDir, entry)
    if (existsSync(destinationPath)) continue
    try {
      renameSync(sourcePath, destinationPath)
    } catch {
      // ignore single file move failure
    }
  }
}

function renameDefaultFolderOnDisk(
  workspaceId: string,
  baseFolder: string,
  legacyName: string,
  nextName: string,
): void {
  if (legacyName === nextName) return

  const legacyPath = join(baseFolder, legacyName)
  const nextPath = join(baseFolder, nextName)

  if (existsSync(legacyPath) && existsSync(nextPath)) {
    mergeFolderContents(legacyPath, nextPath)
    try {
      if (readdirSync(legacyPath).length === 0) {
        rmdirSync(legacyPath)
      }
    } catch {
      // ignore cleanup failure
    }
  }

  renameKnowledgeStorageFolder(workspaceId, legacyPath, nextPath)
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

function resolveDefaultFolderKnowledgeBase(
  workspaceId: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
) {
  const name = DEFAULT_FOLDER_KB_NAMES[kind]
  const legacyName = kind === 'local' ? null : LEGACY_DEFAULT_FOLDER_KB_NAMES[kind]
  const items = listKnowledgeBases({ workspaceId })
  const kbRepo = getKnowledgeBaseRepository()

  let existing =
    items.find((item) => item.name === name && item.kind === kind) ??
    items.find((item) => item.name === name) ??
    (legacyName
      ? items.find((item) => item.name === legacyName && item.kind === kind) ??
        items.find((item) => item.name === legacyName)
      : null)

  if (existing && existing.name !== name) {
    kbRepo.update({
      id: existing.id,
      workspaceId,
      name,
    })
    existing = { ...existing, name }
  }

  return existing
}

export function ensureDefaultFolderKnowledgeBase(input: unknown) {
  const data = KnowledgeDefaultFolderEnsureKbInputSchema.parse(input)
  const name = DEFAULT_FOLDER_KB_NAMES[data.kind]
  const legacyName =
    data.kind === 'local' ? null : LEGACY_DEFAULT_FOLDER_KB_NAMES[data.kind]
  const folderPath =
    data.kind === 'network'
      ? ensureWorkspaceNetworkKnowledgeFolder({ workspaceId: data.workspaceId })
      : data.kind === 'local_files'
        ? ensureWorkspaceLocalFilesFolder({ workspaceId: data.workspaceId })
        : ensureWorkspaceKnowledgeFolder({ workspaceId: data.workspaceId })

  const existing = resolveDefaultFolderKnowledgeBase(data.workspaceId, data.kind)
  const kb = existing ?? createKnowledgeBase({
    workspaceId: data.workspaceId,
    name,
    description: '默认文件夹知识库',
    kind: data.kind,
  })

  if (legacyName) {
    renameDefaultFolderOnDisk(data.workspaceId, folderPath, legacyName, name)
  }

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

const DEFAULT_FOLDER_KINDS = ['local', 'network', 'local_files'] as const

export function migrateAllDefaultFolderKnowledgeBases(): {
  workspaceCount: number
  migratedKinds: number
} {
  let workspaceCount = 0
  let migratedKinds = 0

  for (const workspace of listWorkspaces()) {
    workspaceCount += 1
    for (const kind of DEFAULT_FOLDER_KINDS) {
      try {
        ensureDefaultFolderKnowledgeBase({ workspaceId: workspace.id, kind })
        migratedKinds += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[knowledge] default folder migration failed for workspace ${workspace.id} (${kind}): ${message}`,
        )
      }
    }
  }

  return { workspaceCount, migratedKinds }
}
