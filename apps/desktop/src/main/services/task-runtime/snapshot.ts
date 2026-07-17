import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { TaskSnapshotSchema, type AgentTask, type TaskSnapshot, taskSnapshotPathFromRoot } from '@toolman/shared'

import { getDefaultTaskRuntimeDir } from './paths'
import { ensureTaskWorkspaceLayout, getTaskWorkspacePaths } from './task-workspace.service'

export function writeTaskSnapshot(task: AgentTask): TaskSnapshot {
  const { taskRoot, snapshotPath } = getTaskWorkspacePaths(task)
  ensureTaskWorkspaceLayout(taskRoot)

  const snapshot: TaskSnapshot = {
    snapshotVersion: 1,
    task,
    syncedAt: Date.now(),
  }
  TaskSnapshotSchema.parse(snapshot)
  mkdirSync(dirname(snapshotPath), { recursive: true })
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}

export function readTaskSnapshot(taskId: string, workspaceRoot?: string): TaskSnapshot | null {
  const taskRoot = workspaceRoot?.trim() || getDefaultTaskRuntimeDir(taskId)
  const path = taskSnapshotPathFromRoot(taskRoot)
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return TaskSnapshotSchema.parse(parsed)
  } catch {
    return null
  }
}

export function syncTaskSnapshotFromDb(task: AgentTask): void {
  try {
    writeTaskSnapshot(task)
  } catch {
    // Snapshot is best-effort; DB remains authoritative.
  }
}
