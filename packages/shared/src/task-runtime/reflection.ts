import { z } from 'zod'

import { TaskReflectionVerdictSchema } from './events.js'
import { TaskPlanStepSchema } from './plan.js'

export const TaskReflectionRawVerdictSchema = z.enum(['pass', 'fail', 'replan', 'continue', 'abort'])
export type TaskReflectionRawVerdict = z.infer<typeof TaskReflectionRawVerdictSchema>

export const TaskReflectionResultSchema = z.object({
  verdict: TaskReflectionRawVerdictSchema,
  reason: z.string().min(1).max(4000),
  summary: z.string().max(4000).optional(),
  nextSteps: z.array(TaskPlanStepSchema).optional(),
})
export type TaskReflectionResult = z.infer<typeof TaskReflectionResultSchema>

export function normalizeReflectionVerdict(verdict: TaskReflectionRawVerdict): z.infer<typeof TaskReflectionVerdictSchema> {
  if (verdict === 'continue') return 'pass'
  if (verdict === 'abort') return 'fail'
  return verdict
}

export function extractReflectionJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('反思结果中未找到 JSON 对象')
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown
}

export function parseTaskReflectionFromText(text: string): TaskReflectionResult {
  const raw = extractReflectionJsonObject(text)
  return TaskReflectionResultSchema.parse(raw)
}

export function summarizeStepOutput(output: unknown): string | undefined {
  if (output == null) return undefined
  if (typeof output === 'string') {
    return output.length > 500 ? `${output.slice(0, 500)}…` : output
  }
  if (typeof output === 'object' && output !== null && 'text' in output) {
    const text = (output as { text?: unknown }).text
    if (typeof text === 'string') {
      return text.length > 500 ? `${text.slice(0, 500)}…` : text
    }
  }
  try {
    const json = JSON.stringify(output)
    return json.length > 500 ? `${json.slice(0, 500)}…` : json
  } catch {
    return undefined
  }
}
