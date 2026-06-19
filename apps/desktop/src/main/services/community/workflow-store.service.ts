import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { app } from 'electron'

export const StoredWorkflowSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  engine: z.string().min(1).max(64),
  graph: z.record(z.unknown()),
  graphPath: z.string().min(1).max(256),
  sourcePackagePath: z.string().optional(),
  communityResourceId: z.string().uuid().optional(),
  requiredMcpIds: z.array(z.string()).default([]),
  requiredSkillIds: z.array(z.string()).default([]),
  installedAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
})

export type StoredWorkflow = z.infer<typeof StoredWorkflowSchema>

export const WorkflowUpsertInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  engine: z.string().min(1).max(64),
  graph: z.record(z.unknown()),
  graphPath: z.string().min(1).max(256),
  sourcePackagePath: z.string().optional(),
  communityResourceId: z.string().uuid().optional(),
  requiredMcpIds: z.array(z.string()).optional(),
  requiredSkillIds: z.array(z.string()).optional(),
})

export type WorkflowUpsertInput = z.infer<typeof WorkflowUpsertInputSchema>

const WORKFLOWS_FILE = 'workflows.json'

let cache: StoredWorkflow[] | null = null

function workflowsFilePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, WORKFLOWS_FILE)
}

function loadWorkflows(): StoredWorkflow[] {
  const path = workflowsFilePath()
  if (!existsSync(path)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => StoredWorkflowSchema.parse(item))
  } catch {
    return []
  }
}

function saveWorkflows(workflows: StoredWorkflow[]): void {
  writeFileSync(workflowsFilePath(), JSON.stringify(workflows, null, 2), 'utf8')
  cache = workflows
}

function getWorkflows(): StoredWorkflow[] {
  if (!cache) cache = loadWorkflows()
  return cache
}

export function listStoredWorkflows(): StoredWorkflow[] {
  return [...getWorkflows()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function getStoredWorkflow(id: string): StoredWorkflow | null {
  return getWorkflows().find((workflow) => workflow.id === id) ?? null
}

export function upsertStoredWorkflow(input: unknown): StoredWorkflow {
  const data = WorkflowUpsertInputSchema.parse(input)
  const now = Date.now()
  const workflows = [...getWorkflows()]
  const index = workflows.findIndex((workflow) => workflow.id === data.id)
  const existing = index >= 0 ? workflows[index] : null

  const next = StoredWorkflowSchema.parse({
    ...data,
    requiredMcpIds: data.requiredMcpIds ?? [],
    requiredSkillIds: data.requiredSkillIds ?? [],
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
  })

  if (index >= 0) {
    workflows[index] = next
  } else {
    workflows.push(next)
  }

  saveWorkflows(workflows)
  return next
}

export function deleteStoredWorkflow(id: string): boolean {
  const workflows = getWorkflows()
  const next = workflows.filter((workflow) => workflow.id !== id)
  if (next.length === workflows.length) return false
  saveWorkflows(next)
  return true
}

export function invalidateWorkflowStoreCache(): void {
  cache = null
}
