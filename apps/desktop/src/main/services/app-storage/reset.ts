import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { purgeAllKnowledgeStorageData } from '../knowledge.service'
import { fireAndForget } from '../../lib/fire-and-forget'
import { purgeAllMemoryData } from '../memory-entry.service'
import { assertPathWithinAllowedRoots } from '../path-sandbox.service'

/** Sidecar dirs removed by「重置数据」（minimal reset） */
export const RESET_DATA_TARGET_DIRS = ['cache', 'GPUCache', 'Code Cache', 'logs', 'agent-memory', 'agent-tasks'] as const

function ensureKnowledgeDir(): string {
  const dir = join(app.getPath('userData'), 'knowledge')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function removeDirIfExists(userData: string, name: string): boolean {
  const path = join(userData, name)
  if (!existsSync(path)) return false
  rmSync(path, { recursive: true, force: true })
  return true
}

export function deleteKnowledgeFiles() {
  const dir = ensureKnowledgeDir()
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })
  fireAndForget('knowledge', purgeAllKnowledgeStorageData())
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
