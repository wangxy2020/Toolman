import { z } from 'zod'

import { TaskStepKindSchema } from './types.js'

export const TaskPlanToolStepSchema = z.object({
  toolName: z.string().min(1),
  argsJson: z.string(),
})
export type TaskPlanToolStep = z.infer<typeof TaskPlanToolStepSchema>

export const TaskPlanStepSchema = z.object({
  kind: TaskStepKindSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  tool: TaskPlanToolStepSchema.optional(),
})
export type TaskPlanStep = z.infer<typeof TaskPlanStepSchema>

export const TaskPlanSchema = z.object({
  goal: z.string().min(1).max(8000),
  summary: z.string().max(4000).optional(),
  steps: z.array(TaskPlanStepSchema).min(1).max(50),
})
export type TaskPlan = z.infer<typeof TaskPlanSchema>

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('规划结果中未找到 JSON 对象')
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown
}

function normalizeRawPlanTool(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const tool = raw.tool
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return undefined
  }

  const next = { ...(tool as Record<string, unknown>) }
  if (typeof next.toolName !== 'string') {
    return undefined
  }

  if (typeof next.argsJson !== 'string') {
    if (next.args && typeof next.args === 'object') {
      next.argsJson = JSON.stringify(next.args)
      delete next.args
    } else if (next.arguments && typeof next.arguments === 'object') {
      next.argsJson = JSON.stringify(next.arguments)
      delete next.arguments
    } else {
      next.argsJson = '{}'
    }
  }

  return { toolName: next.toolName, argsJson: next.argsJson }
}

function normalizeRawPlanStep(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw
  }

  const step = { ...(raw as Record<string, unknown>) }
  const normalizedTool = normalizeRawPlanTool(step)
  if (normalizedTool) {
    step.tool = normalizedTool
    if (typeof step.kind !== 'string') {
      step.kind = 'tool'
    }
    return step
  }

  if (typeof step.toolName === 'string') {
    let argsJson = '{}'
    if (typeof step.argsJson === 'string') {
      argsJson = step.argsJson
    } else if (step.args && typeof step.args === 'object') {
      argsJson = JSON.stringify(step.args)
    } else if (step.arguments && typeof step.arguments === 'object') {
      argsJson = JSON.stringify(step.arguments)
    }

    step.tool = { toolName: step.toolName, argsJson }
    step.kind = typeof step.kind === 'string' ? step.kind : 'tool'
    delete step.toolName
    delete step.argsJson
    delete step.args
    delete step.arguments
  }

  return step
}

export function normalizeRawTaskPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw
  }

  const plan = { ...(raw as Record<string, unknown>) }
  if (Array.isArray(plan.steps)) {
    plan.steps = plan.steps.map(normalizeRawPlanStep)
  }
  return plan
}

export function parseTaskPlanFromText(text: string): TaskPlan {
  const raw = normalizeRawTaskPlan(extractJsonObject(text))
  return TaskPlanSchema.parse(raw)
}
