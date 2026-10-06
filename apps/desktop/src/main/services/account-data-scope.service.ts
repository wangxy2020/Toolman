import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import { BrowserWindow } from 'electron'
import {
  assistants,
  documentSources,
  documents,
  fileRegistry,
  knowledgeBases,
  p2pWorkspaces,
  pmProjects,
  providers,
  sessions,
  workspaces,
  DEFAULT_LOCAL_MODEL,
} from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getLocalIdentityId } from './local-identity'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { getDocumentsFolderSlug } from './documents-folder-slug.service'
import {
  ensureToolmanUserDocumentFoldersAt,
  getToolmanDocumentsRootPath,
  normalizeFolderPath,
  TOOLMAN_DEFAULT_FOLDER_PARENTS,
  TOOLMAN_USER_DOCUMENT_SUBFOLDERS,
} from './toolman-user-documents.service'
import { getDefaultWorkspace, getWorkspace, updateWorkspace } from './workspace.service'
import { bindNotesDataAccount } from './notes-data/storage'
import {
  adoptLegacyWorkflowsForSlug,
  bindWorkflowAccount,
  readLegacyWorkflowSessionIds,
} from './community/workflow-store.service'
import { inferDisplacedOwnerSlug } from './account-data-scope-infer'
import {
  readAccountDataScope,
  stampMissingGroups,
  writeAccountDataScope,
  type AccountDataScopeFile,
} from './account-group-scope'

const FOLDER_KEYS = [
  'folderPath',
  'knowledgeFolderPath',
  'networkKnowledgeFolderPath',
  'sharedKnowledgeFolderPath',
  'syncKnowledgeFolderPath',
  'localFilesFolderPath',
] as const

function userRootForSlug(slug: string): string {
  return join(getToolmanDocumentsRootPath(), slug)
}

export function ensureToolmanFoldersForSlug(slug: string): string {
  return ensureToolmanUserDocumentFoldersAt(userRootForSlug(slug))
}

function ensureExistingAccountLayouts(): void {
  const root = getToolmanDocumentsRootPath()
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    ensureToolmanUserDocumentFoldersAt(join(root, entry.name))
  }
}

function folderSettingsForSlug(slug: string): Record<string, string> {
  const root = userRootForSlug(slug)
  return {
    folderPath: join(root, '工作区'),
    knowledgeFolderPath: join(root, '本地知识库'),
    networkKnowledgeFolderPath: join(root, '网络知识库'),
    sharedKnowledgeFolderPath: join(root, '共享知识库'),
    syncKnowledgeFolderPath: join(root, '同步知识库'),
    localFilesFolderPath: join(root, '本地文件'),
  }
}

function listSiblingSlugs(currentSlug: string): string[] {
  const root = getToolmanDocumentsRootPath()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== currentSlug)
    .map((entry) => entry.name)
}

function listReferencedPaths(workspaceId: string): string[] {
  const db = getDatabase()
  const paths: string[] = []
  const kbIds = db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(eq(knowledgeBases.workspaceId, workspaceId))
    .all()
  for (const kb of kbIds) {
    const rows = db
      .select({ path: documents.absolutePath })
      .from(documents)
      .where(eq(documents.kbId, kb.id))
      .all()
    for (const row of rows) {
      if (row.path) paths.push(row.path)
    }
  }
  const files = db
    .select({ path: fileRegistry.absolutePath })
    .from(fileRegistry)
    .where(eq(fileRegistry.workspaceId, workspaceId))
    .all()
  for (const file of files) paths.push(file.path)
  return paths
}

function listGroupIds(): string[] {
  return getDatabase()
    .select({ id: p2pWorkspaces.id })
    .from(p2pWorkspaces)
    .all()
    .map((row: { id: string }) => row.id)
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(fullPath))
    else if (entry.isFile()) files.push(fullPath)
  }
  return files
}

function removeEmptyDirectories(root: string): void {
  const keep = new Set(
    [
      root,
      ...TOOLMAN_USER_DOCUMENT_SUBFOLDERS.map((name) => join(root, name)),
      ...TOOLMAN_DEFAULT_FOLDER_PARENTS.map((name) => join(root, name, '默认文件夹')),
    ].map((path) => normalizeFolderPath(path)),
  )
  const dirs: string[] = []
  const collect = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const fullPath = join(dir, entry.name)
      collect(fullPath)
      dirs.push(fullPath)
    }
  }
  collect(root)
  dirs.sort((left, right) => right.length - left.length)
  for (const dir of dirs) {
    if (keep.has(normalizeFolderPath(dir))) continue
    try {
      for (const name of readdirSync(dir)) {
        if (name === '.DS_Store') unlinkSync(join(dir, name))
      }
      if (readdirSync(dir).length === 0) rmdirSync(dir)
    } catch {
      // Directory still has files that belong in this account folder.
    }
  }
}

function mergeAccountFolder(fromRoot: string, toRoot: string): void {
  if (normalizeFolderPath(fromRoot) === normalizeFolderPath(toRoot)) return
  if (!existsSync(fromRoot)) return
  mkdirSync(toRoot, { recursive: true })
  for (const filePath of walkFiles(fromRoot)) {
    const dest = join(toRoot, relative(fromRoot, filePath))
    mkdirSync(dirname(dest), { recursive: true })
    if (existsSync(dest)) {
      try {
        if (statSync(filePath).size === statSync(dest).size) unlinkSync(filePath)
      } catch {
        // Leave the source file when the sizes cannot be compared.
      }
      continue
    }
    renameSync(filePath, dest)
  }
  removeEmptyDirectories(fromRoot)
}

function setOnlyDefaultWorkspace(workspaceId: string): void {
  const db = getDatabase()
  const now = new Date()
  db.update(workspaces).set({ isDefault: false, updatedAt: now }).run()
  db.update(workspaces)
    .set({ isDefault: true, updatedAt: now })
    .where(eq(workspaces.id, workspaceId))
    .run()
}

function ensureWorkspaceForSlug(scope: AccountDataScopeFile, slug: string): string {
  const existingId = scope.workspaces[slug]
  if (existingId && getWorkspace({ id: existingId })) return existingId

  const db = getDatabase()
  const now = new Date()
  const workspaceId = randomUUID()
  const providerId = randomUUID()
  db.insert(workspaces)
    .values({
      id: workspaceId,
      name: '默认工作区',
      ownerId: getLocalIdentityId(),
      settingsJson: JSON.stringify({
        theme: 'system',
        defaultLocale: 'zh-CN',
        ...folderSettingsForSlug(slug),
      }),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(providers)
    .values({
      id: providerId,
      workspaceId,
      name: 'Ollama',
      type: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelsJson: '[]',
      configJson: JSON.stringify({ presetId: 'ollama' }),
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(assistants)
    .values({
      id: randomUUID(),
      workspaceId,
      name: '通用智能体',
      description: '默认 AI 对话智能体',
      systemPrompt: '你是一个有帮助的 AI 助手。',
      modelId: `${providerId}:${DEFAULT_LOCAL_MODEL}`,
      parametersJson: JSON.stringify({ temperature: 0.7, maxTokens: 4096 }),
      isBuiltin: true,
      isPinned: true,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  scope.workspaces[slug] = workspaceId
  ensureToolmanFoldersForSlug(slug)
  return workspaceId
}

function replaceFolderPathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
  const normalizedPath = normalizeFolderPath(path)
  const normalizedOld = normalizeFolderPath(oldPrefix)
  const normalizedNew = normalizeFolderPath(newPrefix)
  if (normalizedPath === normalizedOld) return normalizedNew
  const oldWithSep = `${normalizedOld}/`
  if (!normalizedPath.startsWith(oldWithSep)) return null
  return `${normalizedNew}/${normalizedPath.slice(oldWithSep.length)}`
}

function rewriteKnowledgePaths(workspaceId: string, fromRoot: string, toRoot: string): void {
  const db = getDatabase()
  const docRepo = getDocumentRepository()
  const kbRepo = getKnowledgeBaseRepository()
  const now = new Date()

  for (const kb of kbRepo.listByWorkspace(workspaceId)) {
    try {
      const parsed = JSON.parse(kb.watchConfigJson) as { paths?: unknown }
      if (Array.isArray(parsed.paths)) {
        let changed = false
        const paths = parsed.paths.map((path) => {
          if (typeof path !== 'string') return path
          const next = replaceFolderPathPrefix(path, fromRoot, toRoot)
          if (!next || next === path) return path
          changed = true
          return next
        })
        if (changed) {
          kbRepo.update({
            id: kb.id,
            workspaceId,
            watchConfigJson: JSON.stringify({ ...parsed, paths }),
          })
        }
      }
    } catch {
      // Leave a watch config that is not JSON.
    }

    for (const source of docRepo.listSourcesByKb(kb.id)) {
      const nextUri = replaceFolderPathPrefix(source.uri, fromRoot, toRoot)
      if (!nextUri || nextUri === source.uri) continue
      db.update(documentSources)
        .set({ uri: nextUri, updatedAt: now })
        .where(and(eq(documentSources.id, source.id), eq(documentSources.kbId, kb.id)))
        .run()
    }

    for (const doc of docRepo.listByKb(kb.id)) {
      if (!doc.absolutePath) continue
      const nextPath = replaceFolderPathPrefix(doc.absolutePath, fromRoot, toRoot)
      if (!nextPath || nextPath === doc.absolutePath) continue
      docRepo.update(doc.id, kb.id, { absolutePath: nextPath })
    }
  }

  const registryRows = db
    .select({ id: fileRegistry.id, absolutePath: fileRegistry.absolutePath })
    .from(fileRegistry)
    .where(eq(fileRegistry.workspaceId, workspaceId))
    .all()
  for (const row of registryRows) {
    const nextPath = replaceFolderPathPrefix(row.absolutePath, fromRoot, toRoot)
    if (!nextPath || nextPath === row.absolutePath) continue
    db.update(fileRegistry)
      .set({ absolutePath: nextPath, updatedAt: now })
      .where(eq(fileRegistry.id, row.id))
      .run()
  }
}

function rewriteProjectRoots(workspaceId: string, fromRoot: string, toRoot: string): void {
  const db = getDatabase()
  const rows = db
    .select()
    .from(pmProjects)
    .where(eq(pmProjects.workspaceId, workspaceId))
    .all()
  const now = new Date()
  for (const row of rows) {
    if (!row.workspaceRoot) continue
    const next = replaceFolderPathPrefix(row.workspaceRoot, fromRoot, toRoot)
    if (!next || next === row.workspaceRoot) continue
    db.update(pmProjects)
      .set({ workspaceRoot: next, updatedAt: now })
      .where(eq(pmProjects.id, row.id))
      .run()
  }
}

function returnWorkspaceToOwner(workspaceId: string, fromSlug: string, toSlug: string): void {
  const fromRoot = userRootForSlug(fromSlug)
  const toRoot = userRootForSlug(toSlug)
  mergeAccountFolder(fromRoot, toRoot)
  ensureToolmanFoldersForSlug(toSlug)

  const workspace = getWorkspace({ id: workspaceId })
  if (workspace) {
    const settingsPatch: Record<string, string> = {}
    for (const key of FOLDER_KEYS) {
      const value = workspace.settings[key]
      if (typeof value !== 'string') continue
      const next = replaceFolderPathPrefix(value, fromRoot, toRoot)
      if (next && next !== value) settingsPatch[key] = next
    }
    if (Object.keys(settingsPatch).length > 0) {
      updateWorkspace({ id: workspaceId, settings: settingsPatch })
    }
  }

  try {
    rewriteKnowledgePaths(workspaceId, fromRoot, toRoot)
  } catch (error) {
    logStructured(
      'knowledge',
      'warn',
      `account path restore skipped: ${toErrorMessage(error, String(error))}`,
    )
  }
  rewriteProjectRoots(workspaceId, fromRoot, toRoot)
  ensureToolmanFoldersForSlug(fromSlug)
}

function bindAccountContent(slug: string): void {
  bindNotesDataAccount(slug)
  bindWorkflowsForSlug(slug)
}

function bindAccountContentAdoptingLegacy(slug: string): void {
  bindNotesDataAccount(slug, { adoptLegacy: true })
  bindWorkflowsForSlug(slug)
}

function workflowOwnerSlug(sessionIds: string[]): string | null {
  if (sessionIds.length === 0) return null
  const rows = getDatabase()
    .select({ workspaceId: sessions.workspaceId })
    .from(sessions)
    .where(inArray(sessions.id, sessionIds))
    .all()
  const workspaceIds = new Set(rows.map((row: { workspaceId: string }) => row.workspaceId))
  if (workspaceIds.size !== 1) return null
  const workspaceId = [...workspaceIds][0]
  if (!workspaceId) return null
  const scope = readAccountDataScope()
  return Object.entries(scope.workspaces).find(([, id]) => id === workspaceId)?.[0] ?? null
}

function bindWorkflowsForSlug(slug: string): void {
  if (workflowOwnerSlug(readLegacyWorkflowSessionIds()) === slug) {
    adoptLegacyWorkflowsForSlug(slug)
  }
  bindWorkflowAccount(slug)
}

function requestAccountSwitchReload(): void {
  setImmediate(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.reload()
    }
  })
}

/** Give the signed-in account its own workspace, notes, and group list. */
export function reconcileAccountDataScope(): void {
  try {
    reconcileAccountDataScopeBody()
  } finally {
    ensureExistingAccountLayouts()
  }
}

function reconcileAccountDataScopeBody(): void {
  const currentSlug = getDocumentsFolderSlug()
  const scope = readAccountDataScope()
  const boundId = scope.workspaces[currentSlug]
  if (boundId && getWorkspace({ id: boundId })) {
    setOnlyDefaultWorkspace(boundId)
    bindAccountContent(currentSlug)
    return
  }

  const current = getDefaultWorkspace()
  const owner =
    current == null
      ? null
      : inferDisplacedOwnerSlug({
          currentSlug,
          currentRoot: userRootForSlug(currentSlug),
          documentsRoot: getToolmanDocumentsRootPath(),
          siblingSlugs: listSiblingSlugs(currentSlug),
          referencedPaths: listReferencedPaths(current.id),
          fileExists: existsSync,
        })

  if (current && owner && owner !== currentSlug) {
    scope.workspaces[owner] = current.id
    returnWorkspaceToOwner(current.id, currentSlug, owner)
    stampMissingGroups(scope, listGroupIds(), owner)
    bindAccountContentAdoptingLegacy(owner)
    const freshId = ensureWorkspaceForSlug(scope, currentSlug)
    writeAccountDataScope(scope)
    setOnlyDefaultWorkspace(freshId)
    bindAccountContent(currentSlug)
    ensureToolmanFoldersForSlug(currentSlug)
    logStructured('auth', 'info', `restored account data from ${currentSlug} to ${owner}`)
    return
  }

  if (current) {
    scope.workspaces[currentSlug] = current.id
    stampMissingGroups(scope, listGroupIds(), currentSlug)
    writeAccountDataScope(scope)
    setOnlyDefaultWorkspace(current.id)
    bindAccountContentAdoptingLegacy(currentSlug)
    return
  }

  const freshId = ensureWorkspaceForSlug(scope, currentSlug)
  writeAccountDataScope(scope)
  setOnlyDefaultWorkspace(freshId)
  bindAccountContentAdoptingLegacy(currentSlug)
}

export function switchAccountDataScope(previousSlug: string, nextSlug: string): void {
  if (!previousSlug.trim() || !nextSlug.trim() || previousSlug === nextSlug) return

  const scope = readAccountDataScope()
  const current = getDefaultWorkspace()
  if (current && !scope.workspaces[previousSlug]) {
    scope.workspaces[previousSlug] = current.id
  }
  stampMissingGroups(scope, listGroupIds(), previousSlug)
  const nextId = ensureWorkspaceForSlug(scope, nextSlug)
  writeAccountDataScope(scope)
  setOnlyDefaultWorkspace(nextId)
  bindAccountContentAdoptingLegacy(previousSlug)
  bindAccountContent(nextSlug)
  ensureExistingAccountLayouts()
  requestAccountSwitchReload()
  logStructured('auth', 'info', `switched account data from ${previousSlug} to ${nextSlug}`)
}
