import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, shell } from 'electron'
import { purgeAllKnowledgeStorageData } from './knowledge.service'
import { purgeAllMemoryData } from './memory-entry.service'
import { assertPathWithinAllowedRoots } from './path-sandbox.service'
import {
  ensureToolmanUserDocumentFolders,
  getToolmanUserRootPath,
} from './toolman-user-documents.service'

const BACKUP_MANIFEST_VERSION = 1

export interface BackupManifest {
  version: number
  createdAt: number
  includesKnowledge: boolean
  includesNotes: boolean
  includesP2pWorkspaces?: boolean
  includesNotesAttachments?: boolean
  dbPath: string
  knowledgePath: string | null
  notesPath: string | null
  p2pWorkspacesPath?: string | null
  notesAttachmentsPath?: string | null
}

export function validateBackupManifest(manifest: unknown): manifest is BackupManifest {
  if (!manifest || typeof manifest !== 'object') return false
  const record = manifest as Record<string, unknown>
  return (
    record.version === BACKUP_MANIFEST_VERSION &&
    typeof record.createdAt === 'number' &&
    typeof record.includesKnowledge === 'boolean' &&
    typeof record.includesNotes === 'boolean' &&
    typeof record.dbPath === 'string' &&
    record.dbPath.length > 0 &&
    (record.knowledgePath === null || typeof record.knowledgePath === 'string') &&
    (record.notesPath === null || typeof record.notesPath === 'string') &&
    (record.includesP2pWorkspaces === undefined || typeof record.includesP2pWorkspaces === 'boolean') &&
    (record.includesNotesAttachments === undefined || typeof record.includesNotesAttachments === 'boolean') &&
    (record.p2pWorkspacesPath === undefined ||
      record.p2pWorkspacesPath === null ||
      typeof record.p2pWorkspacesPath === 'string') &&
    (record.notesAttachmentsPath === undefined ||
      record.notesAttachmentsPath === null ||
      typeof record.notesAttachmentsPath === 'string')
  )
}

export function readBackupManifest(bundlePath: string): BackupManifest | null {
  const manifestPath = join(bundlePath, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
    return validateBackupManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function assertValidRestoreBackupPath(backupPath: string): void {
  if (!existsSync(backupPath)) {
    throw new Error('备份路径不存在')
  }

  if (statSync(backupPath).isFile()) {
    if (!backupPath.endsWith('.db')) {
      throw new Error('单文件备份必须是 .db 文件')
    }
    return
  }

  if (!isBackupBundle(backupPath)) {
    throw new Error('所选目录不是有效的 Toolman 备份包')
  }

  const manifest = readBackupManifest(backupPath)
  if (!manifest) {
    throw new Error('备份包 manifest.json 无效或缺失')
  }

  const dbFile = join(backupPath, manifest.dbPath)
  if (!existsSync(dbFile)) {
    throw new Error(`备份包中未找到 ${manifest.dbPath}`)
  }
}

function getDirSize(targetPath: string): number {
  if (!existsSync(targetPath)) return 0

  let total = 0
  const stack = [targetPath]

  while (stack.length > 0) {
    const current = stack.pop()!
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile()) {
        try {
          total += statSync(fullPath).size
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  return total
}

function ensureKnowledgeDir(): string {
  const dir = join(app.getPath('userData'), 'knowledge')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function isBackupBundle(path: string): boolean {
  if (!existsSync(path)) return false
  if (statSync(path).isFile()) return path.endsWith('.db')
  return existsSync(join(path, 'manifest.json')) || existsSync(join(path, 'toolman.db'))
}

export function getStorageStats() {
  const userData = app.getPath('userData')
  const cacheTargets = [
    join(userData, 'cache'),
    join(userData, 'GPUCache'),
    join(userData, 'Code Cache'),
  ]

  const cacheBytes = cacheTargets.reduce((sum, path) => sum + getDirSize(path), 0)

  let userWorkDirectory = ''
  try {
    userWorkDirectory = ensureToolmanUserDocumentFolders()
  } catch {
    try {
      userWorkDirectory = getToolmanUserRootPath()
    } catch {
      userWorkDirectory = ''
    }
  }

  return {
    cacheBytes,
    userData,
    userWorkDirectory,
    logs: join(userData, 'logs'),
    knowledgeBase: ensureKnowledgeDir(),
  }
}

export async function openPathInShell(path: string) {
  const allowedPath = assertPathWithinAllowedRoots(path)
  if (!existsSync(allowedPath)) {
    return {
      opened: false,
      error: `文件不存在：${allowedPath}`,
    }
  }
  const error = await shell.openPath(allowedPath)
  return {
    opened: !error,
    error: error || undefined,
  }
}

export function revealPathInShell(path: string) {
  const allowedPath = assertPathWithinAllowedRoots(path)
  shell.showItemInFolder(allowedPath)
  return { revealed: true }
}

export function clearAppCache() {
  const userData = app.getPath('userData')
  const cacheTargets = [
    join(userData, 'cache'),
    join(userData, 'GPUCache'),
    join(userData, 'Code Cache'),
  ]

  let clearedBytes = 0
  for (const path of cacheTargets) {
    clearedBytes += getDirSize(path)
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
    }
  }

  return { clearedBytes }
}

export function deleteKnowledgeFiles() {
  const dir = ensureKnowledgeDir()
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
  void purgeAllKnowledgeStorageData()
}

export async function backupAppData(input?: { notesDataJson?: string }) {
  const result = await dialog.showOpenDialog({
    title: '选择备份保存位置',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('已取消备份')
  }

  const userData = app.getPath('userData')
  const dbPath = join(userData, 'toolman.db')
  if (!existsSync(dbPath)) {
    throw new Error('未找到数据库文件')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(result.filePaths[0]!, `toolman-backup-${timestamp}`)
  mkdirSync(backupRoot, { recursive: true })

  cpSync(dbPath, join(backupRoot, 'toolman.db'))

  const knowledgeDir = join(userData, 'knowledge')
  let includesKnowledge = false
  if (existsSync(knowledgeDir)) {
    cpSync(knowledgeDir, join(backupRoot, 'knowledge'), { recursive: true })
    includesKnowledge = true
  }

  let includesNotes = false
  if (input?.notesDataJson) {
    writeFileSync(join(backupRoot, 'notes-data.json'), input.notesDataJson, 'utf8')
    includesNotes = true
  }

  const p2pWorkspacesDir = join(userData, 'p2p-workspaces')
  let includesP2pWorkspaces = false
  if (existsSync(p2pWorkspacesDir)) {
    cpSync(p2pWorkspacesDir, join(backupRoot, 'p2p-workspaces'), { recursive: true })
    includesP2pWorkspaces = true
  }

  const notesAttachmentsDir = join(userData, 'notes-attachments')
  let includesNotesAttachments = false
  if (existsSync(notesAttachmentsDir)) {
    cpSync(notesAttachmentsDir, join(backupRoot, 'notes-attachments'), { recursive: true })
    includesNotesAttachments = true
  }

  writeFileSync(
    join(backupRoot, 'manifest.json'),
    JSON.stringify(
      {
        version: BACKUP_MANIFEST_VERSION,
        createdAt: Date.now(),
        includesKnowledge,
        includesNotes,
        includesP2pWorkspaces,
        includesNotesAttachments,
        dbPath: 'toolman.db',
        knowledgePath: includesKnowledge ? 'knowledge' : null,
        notesPath: includesNotes ? 'notes-data.json' : null,
        p2pWorkspacesPath: includesP2pWorkspaces ? 'p2p-workspaces' : null,
        notesAttachmentsPath: includesNotesAttachments ? 'notes-attachments' : null,
      },
      null,
      2,
    ),
    'utf8',
  )

  return {
    backupPath: backupRoot,
    includesKnowledge,
    includesNotes,
    includesP2pWorkspaces,
    includesNotesAttachments,
    manifestVersion: BACKUP_MANIFEST_VERSION,
  }
}

export async function restoreAppData(input: { backupPath: string; restoreKnowledge?: boolean }) {
  assertValidRestoreBackupPath(input.backupPath)

  const userData = app.getPath('userData')
  const dbPath = join(userData, 'toolman.db')

  if (statSync(input.backupPath).isFile()) {
    cpSync(input.backupPath, dbPath)
    return { restored: true, includesKnowledge: false, requiresRestart: true }
  }

  const bundleDb = join(input.backupPath, 'toolman.db')
  if (!existsSync(bundleDb)) {
    throw new Error('备份包中未找到 toolman.db')
  }

  cpSync(bundleDb, dbPath)

  let includesKnowledge = false
  const knowledgeBackup = join(input.backupPath, 'knowledge')
  if (input.restoreKnowledge !== false && existsSync(knowledgeBackup)) {
    const knowledgeDir = join(userData, 'knowledge')
    if (existsSync(knowledgeDir)) {
      rmSync(knowledgeDir, { recursive: true, force: true })
    }
    cpSync(knowledgeBackup, knowledgeDir, { recursive: true })
    includesKnowledge = true
  }

  const p2pBackup = join(input.backupPath, 'p2p-workspaces')
  if (existsSync(p2pBackup)) {
    const p2pDir = join(userData, 'p2p-workspaces')
    if (existsSync(p2pDir)) {
      rmSync(p2pDir, { recursive: true, force: true })
    }
    cpSync(p2pBackup, p2pDir, { recursive: true })
  }

  const attachmentsBackup = join(input.backupPath, 'notes-attachments')
  if (existsSync(attachmentsBackup)) {
    const attachmentsDir = join(userData, 'notes-attachments')
    if (existsSync(attachmentsDir)) {
      rmSync(attachmentsDir, { recursive: true, force: true })
    }
    cpSync(attachmentsBackup, attachmentsDir, { recursive: true })
  }

  let notesDataJson: string | undefined
  const notesBackup = join(input.backupPath, 'notes-data.json')
  if (existsSync(notesBackup)) {
    notesDataJson = readFileSync(notesBackup, 'utf8')
  }

  return { restored: true, includesKnowledge, notesDataJson, requiresRestart: true }
}

/** Sidecar dirs removed by「重置数据」（minimal reset） */
export const RESET_DATA_TARGET_DIRS = ['cache', 'GPUCache', 'Code Cache', 'logs', 'agent-memory', 'agent-tasks'] as const

function removeDirIfExists(userData: string, name: string): boolean {
  const path = join(userData, name)
  if (!existsSync(path)) return false
  rmSync(path, { recursive: true, force: true })
  return true
}

export function resetAppData() {
  const userData = app.getPath('userData')
  const cleared: string[] = []

  for (const name of RESET_DATA_TARGET_DIRS) {
    if (removeDirIfExists(userData, name)) {
      cleared.push(name)
    }
  }

  const memoryDeleted = purgeAllMemoryData()
  if (memoryDeleted > 0) {
    cleared.push(`memory_entries(${memoryDeleted})`)
  } else {
    cleared.push('memory_entries')
  }

  return { reset: true, cleared, memoryEntriesDeleted: memoryDeleted }
}

export { isBackupBundle }
