import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashText } from '@toolman/knowledge'
import { getMemoryEntryRepository } from '../db/repos'
import {
  indexMemoryEntry,
  migrateJsonMemoriesToDb,
  searchMemoryVectors,
} from './memory-vector.service'

export interface MemoryEntry {
  id: string
  content: string
  assistantId?: string
  createdAt: number
}

function memoryDir(): string {
  const dir = join(app.getPath('userData'), 'agent-memory')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function memoryPath(workspaceId: string): string {
  return join(memoryDir(), `${workspaceId}.json`)
}

function readJsonEntries(workspaceId: string): MemoryEntry[] {
  const path = memoryPath(workspaceId)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as MemoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJsonEntries(workspaceId: string, entries: MemoryEntry[]): void {
  writeFileSync(memoryPath(workspaceId), JSON.stringify(entries, null, 2), 'utf8')
}

let migrationDone = new Set<string>()

async function ensureMigrated(workspaceId: string): Promise<void> {
  if (migrationDone.has(workspaceId)) return
  migrationDone.add(workspaceId)

  const jsonEntries = readJsonEntries(workspaceId)
  if (jsonEntries.length === 0) return

  await migrateJsonMemoriesToDb({
    workspaceId,
    entries: jsonEntries,
  })
}

export function listMemories(
  workspaceId: string,
  options?: { assistantId?: string; retentionDays?: number },
): string[] {
  const cutoff =
    options?.retentionDays && options.retentionDays > 0
      ? Date.now() - options.retentionDays * 24 * 60 * 60 * 1000
      : 0

  const repo = getMemoryEntryRepository()
  const dbEntries = repo.listByWorkspace(workspaceId, {
    assistantId: options?.assistantId,
    limit: 20,
  })

  if (dbEntries.length > 0) {
    return dbEntries
      .filter((entry) => !cutoff || entry.createdAt.getTime() >= cutoff)
      .map((entry) => entry.content)
  }

  return readJsonEntries(workspaceId)
    .filter((entry) => {
      if (cutoff && entry.createdAt < cutoff) return false
      if (options?.assistantId && entry.assistantId && entry.assistantId !== options.assistantId) {
        return false
      }
      return true
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((entry) => entry.content)
}

export async function listRelevantMemories(
  workspaceId: string,
  query: string,
  options?: { assistantId?: string; retentionDays?: number },
): Promise<string[]> {
  await ensureMigrated(workspaceId)

  const recent = listMemories(workspaceId, options)
  let vectorHits: string[] = []

  try {
    const hits = await searchMemoryVectors(workspaceId, query, {
      topK: 6,
      scoreThreshold: 0.35,
    })
    vectorHits = hits.map((hit) => hit.content)
  } catch {
    // Ollama 不可用时仅使用最近记忆
  }

  const merged: string[] = []
  const seen = new Set<string>()
  for (const item of [...vectorHits, ...recent]) {
    const key = item.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(key)
    if (merged.length >= 12) break
  }

  return merged
}

export async function saveMemory(
  workspaceId: string,
  content: string,
  assistantId?: string,
  options?: { sessionId?: string; source?: 'conversation' | 'manual' | 'import' },
): Promise<MemoryEntry> {
  const trimmed = content.trim()
  if (!trimmed) throw new Error('记忆内容不能为空')

  await ensureMigrated(workspaceId)

  const contentHash = hashText(trimmed)
  const repo = getMemoryEntryRepository()
  const existing = repo.findByHash(workspaceId, contentHash)
  if (existing) {
    return {
      id: existing.id,
      content: existing.content,
      assistantId: existing.assistantId ?? undefined,
      createdAt: existing.createdAt.getTime(),
    }
  }

  const row = repo.create({
    workspaceId,
    content: trimmed,
    contentHash,
    assistantId: assistantId ?? null,
    sessionId: options?.sessionId ?? null,
    source: options?.source ?? 'manual',
  })

  try {
    await indexMemoryEntry({
      workspaceId,
      entryId: row.id,
      content: trimmed,
    })
  } catch {
    // 向量索引失败仍保留 DB 记录
  }

  const jsonEntries = readJsonEntries(workspaceId)
  const entry: MemoryEntry = {
    id: row.id,
    content: trimmed,
    assistantId,
    createdAt: row.createdAt.getTime(),
  }
  jsonEntries.unshift(entry)
  writeJsonEntries(workspaceId, jsonEntries.slice(0, 200))

  return entry
}

export function formatMemoryList(workspaceId: string, assistantId?: string): string {
  const items = listMemories(workspaceId, { assistantId })
  if (items.length === 0) return '暂无长期记忆。'
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}
