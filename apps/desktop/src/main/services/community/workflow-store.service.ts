import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
  parentId: z.string().min(1).max(64).optional(),
  sessionId: z.string().min(1).max(64).optional(),
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
  parentId: z.string().min(1).max(64).nullable().optional(),
  sessionId: z.string().min(1).max(64).nullable().optional(),
})

const WORKFLOWS_FILE = 'workflows.json'
const WORKFLOWS_BY_ACCOUNT_DIR = 'workflows-by-account'

let cache: StoredWorkflow[] | null = null
let boundSlug: string | null = null

function userDataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function legacyWorkflowsFilePath(): string {
  return join(userDataDir(), WORKFLOWS_FILE)
}

function workflowsFilePathForSlug(slug: string): string {
  return join(userDataDir(), WORKFLOWS_BY_ACCOUNT_DIR, `${slug}.json`)
}

function workflowsFilePath(): string {
  if (boundSlug) return workflowsFilePathForSlug(boundSlug)
  return legacyWorkflowsFilePath()
}

export function readLegacyWorkflowSessionIds(): string[] {
  const path = legacyWorkflowsFilePath()
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const parsedItem = StoredWorkflowSchema.safeParse(item)
        return parsedItem.success ? parsedItem.data.sessionId : undefined
      })
      .filter((id): id is string => Boolean(id))
  } catch {
    return []
  }
}

/** Move the unscoped workflows.json onto the account that already owned those topics. */
export function adoptLegacyWorkflowsForSlug(slug: string): void {
  const next = slug.trim()
  if (!next) return
  const target = workflowsFilePathForSlug(next)
  if (existsSync(target)) return
  const legacy = legacyWorkflowsFilePath()
  if (!existsSync(legacy)) return
  mkdirSync(dirname(target), { recursive: true })
  renameSync(legacy, target)
  cache = null
}

export function bindWorkflowAccount(slug: string): void {
  const next = slug.trim()
  if (!next || boundSlug === next) return
  boundSlug = next
  cache = null
}

export function resetWorkflowAccountBindingForTests(): void {
  boundSlug = null
  cache = null
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
    parentId: data.parentId === null ? undefined : (data.parentId ?? existing?.parentId),
    sessionId: data.sessionId === null ? undefined : (data.sessionId ?? existing?.sessionId),
    requiredMcpIds: data.requiredMcpIds ?? existing?.requiredMcpIds ?? [],
    requiredSkillIds: data.requiredSkillIds ?? existing?.requiredSkillIds ?? [],
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
  const toRemove = new Set(
    workflows.filter((workflow) => workflow.id === id || workflow.parentId === id).map((w) => w.id),
  )
  if (toRemove.size === 0) return false
  saveWorkflows(workflows.filter((workflow) => !toRemove.has(workflow.id)))
  return true
}
