import { existsSync, readFileSync } from 'node:fs'
import {
  type LegacyAgentTaskStatus,
  legacyTaskStatusToTaskStatus,
} from '@toolman/shared'
import { getAssistantRow } from '../assistant.service'
import { getLegacyAgentTasksPath } from './paths'
import { syncTaskSnapshotFromDb } from './snapshot'
import {
  finalizeTaskWorkspace,
  getRepo,
} from './store-core'

interface LegacyJsonTask {
  id: string
  title: string
  status: LegacyAgentTaskStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

export function migrateLegacyAgentTasksFile(assistantId: string): number {
  const path = getLegacyAgentTasksPath(assistantId)
  if (!existsSync(path)) {
    return 0
  }

  const assistant = getAssistantRow(assistantId)
  if (!assistant) {
    return 0
  }

  let parsed: LegacyJsonTask[] = []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    parsed = Array.isArray(raw) ? (raw as LegacyJsonTask[]) : []
  } catch {
    return 0
  }

  const repo = getRepo()
  let imported = 0

  for (const item of parsed) {
    if (!item?.id || !item.title?.trim()) continue
    if (repo.getById(item.id)) continue

    try {
      const task = repo.importLegacyTask({
        id: item.id,
        workspaceId: assistant.workspaceId,
        assistantId,
        title: item.title.trim(),
        status: legacyTaskStatusToTaskStatus(item.status ?? 'pending'),
        notes: item.notes?.trim() || undefined,
        executorModelId: assistant.modelId,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: item.updatedAt ?? Date.now(),
      })
      const finalized = finalizeTaskWorkspace(task, { assistantId })
      syncTaskSnapshotFromDb(finalized)
      imported += 1
    } catch {
      // skip invalid rows
    }
  }

  return imported
}

export function migrateAllLegacyAgentTasks(assistantIds: string[]): number {
  return assistantIds.reduce((sum, id) => sum + migrateLegacyAgentTasksFile(id), 0)
}

