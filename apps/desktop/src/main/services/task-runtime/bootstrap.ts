import { DEFAULT_WORKSPACE_ID } from '../../bootstrap/database-defaults'
import { listAssistants } from '../assistant.service'
import { bootstrapTaskWorkerResume } from './task-queue/task-resume.service'
import { listAgentTasksByWorkspace, migrateAllLegacyAgentTasks, repairTaskWorkspaceRecord } from './store'

let legacyMigrationDone = false
let workspaceBootstrapDone = false

/** One-time import of pre-T01 `{userData}/agent-tasks/*.json` into SQLite. */
export function bootstrapTaskRuntimeLegacyMigration(): void {
  if (legacyMigrationDone) return
  legacyMigrationDone = true

  const assistants = listAssistants({ workspaceId: DEFAULT_WORKSPACE_ID })
  const ids = assistants.map((item) => item.id)
  migrateAllLegacyAgentTasks(ids)
}

/** Ensure workspace subdirs + workspaceRoot for existing tasks (T04). */
export function bootstrapTaskRuntimeWorkspaces(): void {
  if (workspaceBootstrapDone) return
  workspaceBootstrapDone = true

  const tasks = listAgentTasksByWorkspace(DEFAULT_WORKSPACE_ID, 1000)
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
  bootstrapTaskWorkerResume(DEFAULT_WORKSPACE_ID)
}
