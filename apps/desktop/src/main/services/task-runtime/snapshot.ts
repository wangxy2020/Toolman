import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { TaskSnapshotSchema, type AgentTask, type TaskSnapshot } from '@toolman/shared'

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

export function syncTaskSnapshotFromDb(task: AgentTask): void {
  try {
    writeTaskSnapshot(task)
  } catch {
    // Snapshot is best-effort; DB remains authoritative.
  }
}
