import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type AgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface AgentTask {
  id: string
  title: string
  status: AgentTaskStatus
  notes?: string
  createdAt: number
  updatedAt: number
}

function taskDir(): string {
  const dir = join(app.getPath('userData'), 'agent-tasks')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function taskPath(assistantId: string): string {
  return join(taskDir(), `${assistantId}.json`)
}

function readTasks(assistantId: string): AgentTask[] {
  const path = taskPath(assistantId)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as AgentTask[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTasks(assistantId: string, tasks: AgentTask[]): void {
  writeFileSync(taskPath(assistantId), JSON.stringify(tasks, null, 2), 'utf8')
}

export function listAgentTasks(assistantId: string): AgentTask[] {
  return readTasks(assistantId).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createAgentTask(assistantId: string, title: string, notes?: string): AgentTask {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('任务标题不能为空')

  const now = Date.now()
  const task: AgentTask = {
    id: randomUUID(),
    title: trimmed,
    status: 'pending',
    notes: notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }

  const tasks = readTasks(assistantId)
  tasks.unshift(task)
  writeTasks(assistantId, tasks.slice(0, 100))
  return task
}

export function updateAgentTask(
  assistantId: string,
  taskId: string,
  patch: Partial<Pick<AgentTask, 'title' | 'status' | 'notes'>>,
): AgentTask {
  const tasks = readTasks(assistantId)
  const index = tasks.findIndex((task) => task.id === taskId)
  if (index < 0) throw new Error('任务不存在')

  const current = tasks[index]
  const next: AgentTask = {
    ...current,
    ...patch,
    title: patch.title?.trim() || current.title,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : current.notes,
    updatedAt: Date.now(),
  }
  tasks[index] = next
  writeTasks(assistantId, tasks)
  return next
}

export function formatAgentTasks(assistantId: string): string {
  const tasks = listAgentTasks(assistantId)
  if (tasks.length === 0) return '当前没有任务。'

  return tasks
    .slice(0, 20)
    .map(
      (task) =>
        `- [${task.status}] ${task.title} (id: ${task.id})${task.notes ? ` — ${task.notes}` : ''}`,
    )
    .join('\n')
}
