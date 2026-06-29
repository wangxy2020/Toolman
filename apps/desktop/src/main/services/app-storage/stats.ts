import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  ensureToolmanUserDocumentFolders,
  getToolmanUserRootPath,
} from '../toolman-user-documents.service'
import { BACKUP_MANIFEST_VERSION, validateBackupManifest, type BackupManifest } from './types'

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

export function isBackupBundle(path: string): boolean {
  if (!existsSync(path)) return false
  if (statSync(path).isFile()) return path.endsWith('.db')
  return existsSync(join(path, 'manifest.json')) || existsSync(join(path, 'toolman.db'))
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

export { BACKUP_MANIFEST_VERSION }
