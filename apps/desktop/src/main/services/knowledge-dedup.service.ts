import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import {KnowledgeFileDedupDeleteInputSchema,
  KnowledgeFileDedupScanCancelInputSchema,
  KnowledgeFileDedupScanInputSchema,
  type KnowledgeFileDedupScanOutputSchema } from '@toolman/shared'
import { hashFileBytes } from '@toolman/knowledge'
import type { z } from 'zod'
import { broadcastKnowledgeDedupEvent } from './knowledge-dedup-broadcast'

type ScanResult = z.infer<typeof KnowledgeFileDedupScanOutputSchema>

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.DS_Store'])
const HASH_BATCH_SIZE = 8
const LISTING_PROGRESS_INTERVAL = 100

const cancelledWorkspaces = new Set<string>()

function scanKey(workspaceId: string): string {
  return workspaceId
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

async function listFilesRecursively(
  rootPath: string,
  key: string,
  onProgress: (listed: number) => void,
): Promise<string[]> {
  const files: string[] = []
  const queue = [rootPath]
  let listed = 0
  let walkedDirs = 0

  while (queue.length > 0) {
    if (cancelledWorkspaces.has(key)) {
      throw new Error('扫描已取消')
    }

    const currentPath = queue.shift()!
    walkedDirs += 1

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = readdirSync(currentPath, { withFileTypes: true }) as Array<{
        name: string
        isDirectory: () => boolean
        isFile: () => boolean
      }>
    } catch {
      continue
    }

    for (const entry of entries) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      const fullPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }
      if (entry.isFile()) {
        files.push(fullPath)
        listed += 1
        if (listed % LISTING_PROGRESS_INTERVAL === 0) {
          onProgress(listed)
        }
      }
    }

    if (walkedDirs % 20 === 0) {
      onProgress(listed)
      await yieldToEventLoop()
    }
  }

  onProgress(listed)
  return files
}

export function cancelDedupScan(input: unknown): boolean {
  const data = KnowledgeFileDedupScanCancelInputSchema.parse(input)
  cancelledWorkspaces.add(scanKey(data.workspaceId))
  broadcastKnowledgeDedupEvent({ type: 'cancelled', workspaceId: data.workspaceId })
  return true
}

export async function scanDuplicateFiles(input: unknown): Promise<ScanResult> {
  const data = KnowledgeFileDedupScanInputSchema.parse(input)
  const workspaceId = data.workspaceId
  const key = scanKey(workspaceId)
  cancelledWorkspaces.delete(key)

  const folderPath = data.folderPath.trim()

  let rootStat
  try {
    rootStat = statSync(folderPath)
  } catch {
    throw new Error('文件夹不存在或无法访问')
  }
  if (!rootStat.isDirectory()) {
    throw new Error('路径不是文件夹')
  }

  broadcastKnowledgeDedupEvent({
    type: 'progress',
    workspaceId,
    phase: 'listing',
    scanned: 0,
    total: 0,
  })

  const filePaths = await listFilesRecursively(folderPath, key, (listed) => {
    if (cancelledWorkspaces.has(key)) return
    broadcastKnowledgeDedupEvent({
      type: 'progress',
      workspaceId,
      phase: 'listing',
      scanned: listed,
      total: 0,
    })
  })

  if (cancelledWorkspaces.has(key)) {
    cancelledWorkspaces.delete(key)
    throw new Error('扫描已取消')
  }

  const total = filePaths.length
  broadcastKnowledgeDedupEvent({
    type: 'progress',
    workspaceId,
    phase: 'hashing',
    scanned: 0,
    total,
  })

  const groups = new Map<string, Array<{ path: string; sizeBytes: number; mtimeMs: number }>>()
  let totalSizeBytes = 0

  for (let index = 0; index < filePaths.length; index += 1) {
    if (cancelledWorkspaces.has(key)) {
      cancelledWorkspaces.delete(key)
      broadcastKnowledgeDedupEvent({ type: 'cancelled', workspaceId })
      throw new Error('扫描已取消')
    }

    const filePath = filePaths[index]!
    try {
      const fileStat = statSync(filePath)
      totalSizeBytes += fileStat.size
      const contentHash = hashFileBytes(filePath)
      const bucket = groups.get(contentHash) ?? []
      bucket.push({
        path: filePath,
        sizeBytes: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
      })
      groups.set(contentHash, bucket)
    } catch {
      // skip unreadable files
    }

    if (index % HASH_BATCH_SIZE === 0 || index === filePaths.length - 1) {
      broadcastKnowledgeDedupEvent({
        type: 'progress',
        workspaceId,
        phase: 'hashing',
        scanned: index + 1,
        total,
        currentPath: filePath,
      })
      await yieldToEventLoop()
    }
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, files]) => files.length > 1)
    .map(([contentHash, files]) => ({
      contentHash,
      sizeBytes: files[0]?.sizeBytes ?? 0,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => b.files.length - a.files.length)

  const savableBytes = duplicateGroups.reduce(
    (sum, group) => sum + group.sizeBytes * (group.files.length - 1),
    0,
  )

  const result: ScanResult = {
    groups: duplicateGroups,
    scannedCount: filePaths.length,
    totalSizeBytes,
    savableBytes,
  }

  broadcastKnowledgeDedupEvent({
    type: 'done',
    workspaceId,
    result,
  })

  cancelledWorkspaces.delete(key)
  return result
}

export function deleteDuplicateFiles(input: unknown) {
  const data = KnowledgeFileDedupDeleteInputSchema.parse(input)
  let deleted = 0
  const failed: Array<{ path: string; message: string }> = []

  for (const filePath of data.filePaths) {
    try {
      unlinkSync(filePath)
      deleted += 1
    } catch (error) {
      failed.push({
        path: filePath,
        message: toErrorMessage(error, '删除失败'),
      })
    }
  }

  return { deleted, failed }
}
