/**
 * @deprecated Import from `./task-runtime/store` instead.
 * Re-exports legacy agent_task_* API backed by SQLite + task.json snapshots.
 */
export type { LegacyAgentTaskStatus as AgentTaskStatus, LegacyAgentTaskListItem as AgentTask } from './task-runtime/store'

export {
  listAgentTasks,
  createAgentTask,
  updateAgentTask,
  formatAgentTasks,
} from './task-runtime/store'
