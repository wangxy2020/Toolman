import { existsSync } from 'node:fs'
import chokidar, { type FSWatcher } from 'chokidar'
import { isNull } from 'drizzle-orm'
import { knowledgeBases } from '@toolman/db'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { knowledgeIngestSupportsFile } from './knowledge-parse-options.service'
import { resolveKnowledgeWatchConfig } from './knowledge-watch-config.service'
import { getDatabase } from '../bootstrap/database'
import { getKnowledgeBaseRepository } from '../db/repos'
import { ensureKnowledgeBaseStorageSource } from './knowledge-kb-storage-source.service'
import { resolveKnowledgeBaseStoragePath } from './knowledge-kb-storage-path.service'
import {
  handleRemovedFile,
  ingestFileAtPath,
  purgeIgnoredKnowledgeDocuments,
  refreshKbStats,
} from './knowledge-ingest.service'

interface WatchTarget {
  workspaceId: string
  kbId: string
  folderPath: string
  sourceId: string
  debounceMs: number
  sourceType?: 'folder' | 'notion_export'
}

const watchers = new Map<string, FSWatcher>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPaths = new Map<string, Set<string>>()
const targetsByKey = new Map<string, WatchTarget>()

function watchKey(workspaceId: string, kbId: string, folderPath: string): string {
  return `${workspaceId}:${kbId}:${folderPath}`
}

function parseWatchConfig(json: string) {
  return resolveKnowledgeWatchConfig(json)
}

function queuePath(key: string, filePath: string, debounceMs: number) {
  const set = pendingPaths.get(key) ?? new Set<string>()
  set.add(filePath)
  pendingPaths.set(key, set)

  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key)
      void flushPending(key)
    }, debounceMs),
  )
}

async function flushPending(key: string) {
  const target = targetsByKey.get(key)
  const paths = pendingPaths.get(key)
  if (!target || !paths || paths.size === 0) return

  const batch = [...paths]
  pendingPaths.delete(key)

  getKnowledgeBaseRepository().update({
    id: target.kbId,
    workspaceId: target.workspaceId,
    status: 'indexing',
  })

  for (const filePath of batch) {
    if (!existsSync(filePath)) {
      await handleRemovedFile({
        workspaceId: target.workspaceId,
        kbId: target.kbId,
        filePath,
      })
      continue
    }

    await ingestFileAtPath({
      workspaceId: target.workspaceId,
      kbId: target.kbId,
      filePath,
      sourceId: target.sourceId,
    })
  }

  refreshKbStats(target.workspaceId, target.kbId, { status: 'idle' })
}

function startWatcher(target: WatchTarget) {
  const key = watchKey(target.workspaceId, target.kbId, target.folderPath)
  stopWatcherByKey(key)

  if (!existsSync(target.folderPath)) return

  targetsByKey.set(key, target)

  const watcher = chokidar.watch(target.folderPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    ignored: (path) =>
      path.includes('node_modules') ||
      path.includes('/.git/') ||
      isIgnoredKnowledgeIngestFile(path),
  })

  const schedule = (filePath: string) => {
    if (isIgnoredKnowledgeIngestFile(filePath)) return
    if (!knowledgeIngestSupportsFile(filePath)) return
    queuePath(key, filePath, target.debounceMs)
  }

  watcher.on('add', schedule)
  watcher.on('change', schedule)
  watcher.on('unlink', schedule)

  watchers.set(key, watcher)
}

function stopWatcherByKey(key: string) {
  const timer = debounceTimers.get(key)
  if (timer) clearTimeout(timer)
  debounceTimers.delete(key)
  pendingPaths.delete(key)
  targetsByKey.delete(key)

  const watcher = watchers.get(key)
  if (watcher) {
    void watcher.close()
    watchers.delete(key)
  }
}

export function stopKnowledgeWatchForFolder(
  workspaceId: string,
  kbId: string,
  folderPath: string,
) {
  stopWatcherByKey(watchKey(workspaceId, kbId, folderPath))
}

export function stopKnowledgeWatchersForKb(workspaceId: string, kbId: string) {
  for (const key of [...watchers.keys()]) {
    if (key.startsWith(`${workspaceId}:${kbId}:`)) {
      stopWatcherByKey(key)
    }
  }
}

export function restartKnowledgeWatchersForKb(workspaceId: string, kbId: string) {
  stopKnowledgeWatchersForKb(workspaceId, kbId)

  const kb = getKnowledgeBaseRepository().findRowById(kbId, workspaceId)
  if (!kb) return

  purgeIgnoredKnowledgeDocuments(workspaceId, kbId)

  const storagePath = resolveKnowledgeBaseStoragePath(kb, { ensure: true })
  if (!storagePath || !existsSync(storagePath)) return

  const source = ensureKnowledgeBaseStorageSource(workspaceId, kbId, storagePath)
  const watchConfig = parseWatchConfig(kb.watchConfigJson)

  registerKnowledgeWatchTarget({
    workspaceId,
    kbId,
    folderPath: storagePath,
    sourceId: source.id,
    debounceMs: watchConfig.debounceMs,
    sourceType: 'folder',
  })
}

export function stopAllKnowledgeWatchers() {
  for (const key of [...watchers.keys()]) {
    stopWatcherByKey(key)
  }
}

export function registerKnowledgeWatchTarget(target: WatchTarget) {
  startWatcher(target)
}

export function bootstrapKnowledgeWatchers() {
  stopAllKnowledgeWatchers()

  const db = getDatabase()
  const rows = db
    .select({
      id: knowledgeBases.id,
      workspaceId: knowledgeBases.workspaceId,
    })
    .from(knowledgeBases)
    .where(isNull(knowledgeBases.deletedAt))
    .all()

  for (const row of rows) {
    restartKnowledgeWatchersForKb(row.workspaceId, row.id)
  }
}

export function getKnowledgeWatchStatus() {
  return [...targetsByKey.entries()].map(([key, target]) => ({
    key,
    workspaceId: target.workspaceId,
    kbId: target.kbId,
    folderPath: target.folderPath,
    watching: watchers.has(key),
  }))
}
