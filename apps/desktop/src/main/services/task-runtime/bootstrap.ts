import { DEFAULT_WORKSPACE_ID } from '../../bootstrap/database-defaults'
import { getActiveWorkspaceId } from '../account-scope.service'
import { listAssistants } from '../assistant.service'
import { bootstrapTaskWorkerResume } from './task-queue/task-resume.service'
import { listAgentTasksByWorkspace, migrateAllLegacyAgentTasks, repairTaskWorkspaceRecord } from './store'

let legacyMigrationDone = false
let workspaceBootstrapDone = false

function resolveBootstrapWorkspaceId(): string {
  return getActiveWorkspaceId() ?? DEFAULT_WORKSPACE_ID
}

/** One-time import of pre-T01 `{userData}/agent-tasks/*.json` into SQLite. */
export function bootstrapTaskRuntimeLegacyMigration(): void {
  if (legacyMigrationDone) return
  legacyMigrationDone = true

  const workspaceId = resolveBootstrapWorkspaceId()
  const assistants = listAssistants({ workspaceId })
  const ids = assistants.map((item) => item.id)
  migrateAllLegacyAgentTasks(ids)
}

/** Ensure workspace subdirs + workspaceRoot for existing tasks (T04). */
export function bootstrapTaskRuntimeWorkspaces(): void {
  if (workspaceBootstrapDone) return
  workspaceBootstrapDone = true

  const workspaceId = resolveBootstrapWorkspaceId()
  const tasks = listAgentTasksByWorkspace(workspaceId, 1000)
  for (const task of tasks) {
    try {
      repairTaskWorkspaceRecord(task)
    } catch {
      // Best-effort repair.
    }
  }
}

/** Resume interrupted tasks into the background worker queue (T17). */
export function bootstrapTaskWorker(): void {
  bootstrapTaskWorkerForWorkspace(resolveBootstrapWorkspaceId())
}

/** Resume tasks for one workspace (used on account switch). */
export function bootstrapTaskWorkerForWorkspace(workspaceId: string): void {
  bootstrapTaskWorkerResume(workspaceId)
}
