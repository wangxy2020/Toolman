import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { basename, join, relative, resolve, sep } from 'node:path'
import {KnowledgeDefaultFolderEnsureKbInputSchema,
  KnowledgeDefaultFolderEnsureKbOutputSchema,
  KnowledgeWatchConfigSchema } from '@toolman/shared'
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from './knowledge.service'
import {
  ensureWorkspaceKnowledgeFolder,
  ensureWorkspaceLocalFilesFolder,
  ensureWorkspaceNetworkKnowledgeFolder,
  getWorkspaceKnowledgeFolderPath,
  getWorkspaceLocalFilesFolderPath,
  getWorkspaceNetworkKnowledgeFolderPath,
  renameKnowledgeStorageFolder,
} from './knowledge-folder.service'
import { listWorkspaces } from './workspace.service'
import {
  getToolmanUserFolderName,
  normalizeFolderPath,
} from './toolman-user-documents.service'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import { restartKnowledgeWatchersForKb, stopKnowledgeWatchersForKb } from './knowledge-watcher.service'
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

function purgeLegacyDefaultDiskFolder(
  workspaceId: string,
  baseFolder: string,
  legacyFolderName: string,
): void {
  const legacyPath = join(baseFolder, legacyFolderName)
  const canonicalPath = join(baseFolder, DEFAULT_FOLDER_KB_NAME)
  if (!existsSync(legacyPath)) return

  mkdirSync(canonicalPath, { recursive: true })
  mergeFolderContents(legacyPath, canonicalPath)
  renameKnowledgeStorageFolder(workspaceId, legacyPath, canonicalPath)

  if (existsSync(legacyPath)) {
    try {
      rmRecursiveIfInside(baseFolder, legacyPath)
    } catch {
      // ignore cleanup failure
    }
  }
}

function purgeLegacyDefaultDiskFoldersForKind(
  workspaceId: string,
  baseFolder: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
): void {
  if (kind === 'local') return
  purgeLegacyDefaultDiskFolder(workspaceId, baseFolder, LEGACY_DEFAULT_FOLDER_KB_NAMES[kind])
}

function removeLegacyKnowledgeBaseRows(
  workspaceId: string,
  kind: keyof typeof DEFAULT_FOLDER_KB_NAMES,
): void {
  if (kind === 'local') return

  const legacyName = LEGACY_DEFAULT_FOLDER_KB_NAMES[kind]
  const kbRepo = getKnowledgeBaseRepository()
  const rows = kbRepo.listByWorkspace(workspaceId).filter((row) => row.kind === kind)
  const canonical = rows.find((row) => row.name === DEFAULT_FOLDER_KB_NAME)
  const legacyRows = rows.filter((row) => row.name === legacyName)

  for (const legacy of legacyRows) {
    if (canonical && legacy.id !== canonical.id) {
      stopKnowledgeWatchersForKb(workspaceId, legacy.id)
      kbRepo.softDelete(legacy.id, workspaceId)
      continue
    }
    if (!canonical) {
      kbRepo.update({
        id: legacy.id,
        workspaceId,
        name: DEFAULT_FOLDER_KB_NAME,
      })
    }
  }
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

function rmRecursiveIfInside(allowedRoot: string, target: string): void {
  const normalizedRoot = normalizeFolderPath(allowedRoot)
  const normalizedTarget = normalizeFolderPath(target)
  if (!normalizedTarget.startsWith(`${normalizedRoot}/`) && normalizedTarget !== normalizedRoot) {
    return
  }
  if (!existsSync(target)) return
  for (const entry of readdirSync(target)) {
    const entryPath = join(target, entry)
    if (statSync(entryPath).isDirectory()) {
      rmRecursiveIfInside(allowedRoot, entryPath)
    } else {
      unlinkSync(entryPath)
    }
  }
  rmdirSync(target)
}

/** Remove mistaken nested ~/ToolmanData/... mirrors under a knowledge root. */
function cleanupNestedToolmanDocumentsMirror(root: string): number {
  const nestedRoot = join(root, 'ToolmanData')
  if (!existsSync(nestedRoot)) return 0

  const userName = getToolmanUserFolderName()
  const nestedUserKnowledge = join(nestedRoot, userName, '本地知识库', DEFAULT_FOLDER_KB_NAME)
  const defaultFolder = join(root, DEFAULT_FOLDER_KB_NAME)
  mkdirSync(defaultFolder, { recursive: true })
  if (existsSync(nestedUserKnowledge)) {
    mergeFolderContents(nestedUserKnowledge, defaultFolder)
  }

  try {
    rmRecursiveIfInside(root, nestedRoot)
  } catch {
    // ignore cleanup failure
  }

  return 1
}

export function cleanupErroneousKnowledgeDiskPaths(): number {
  let cleaned = 0
  for (const workspace of listWorkspaces()) {
    const roots: Array<{ root: string | null; kind: keyof typeof DEFAULT_FOLDER_KB_NAMES }> = [
      { root: getWorkspaceKnowledgeFolderPath({ workspaceId: workspace.id }), kind: 'local' },
      { root: getWorkspaceNetworkKnowledgeFolderPath({ workspaceId: workspace.id }), kind: 'network' },
      { root: getWorkspaceLocalFilesFolderPath({ workspaceId: workspace.id }), kind: 'local_files' },
    ]
    for (const { root, kind } of roots) {
      if (!root) continue
      cleaned += cleanupNestedToolmanDocumentsMirror(root)
      purgeLegacyDefaultDiskFoldersForKind(workspace.id, root, kind)
      removeLegacyKnowledgeBaseRows(workspace.id, kind)
      cleaned += 1
    }
  }
  return cleaned
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

  const existing = resolveDefaultFolderKnowledgeBase(data.workspaceId, data.kind)
  const kb = existing ?? createKnowledgeBase({
    workspaceId: data.workspaceId,
    name,
    description: '默认文件夹知识库',
    kind: data.kind,
  })

  purgeLegacyDefaultDiskFoldersForKind(data.workspaceId, folderPath, data.kind)
  removeLegacyKnowledgeBaseRows(data.workspaceId, data.kind)

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
        const message = toErrorMessage(error, String(error))
        console.warn(
          `[knowledge] default folder migration failed for workspace ${workspace.id} (${kind}): ${message}`,
        )
      }
    }
  }

  cleanupErroneousKnowledgeDiskPaths()
  return { workspaceCount, migratedKinds }
}
