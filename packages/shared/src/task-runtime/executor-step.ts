import { z } from 'zod'

export const TaskToolStepInputSchema = z.object({
  toolName: z.string().min(1),
  argsJson: z.string(),
  toolCallId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
})
export type TaskToolStepInput = z.infer<typeof TaskToolStepInputSchema>

export const TaskToolStepPayloadSchema = z.object({
  toolName: z.string().min(1),
  argsJson: z.string(),
  toolCallId: z.string().min(1).optional(),
})
export type TaskToolStepPayload = z.infer<typeof TaskToolStepPayloadSchema>

export function parseTaskToolStepInput(input: unknown): TaskToolStepPayload {
  return TaskToolStepPayloadSchema.parse(input)
}

export function isTaskToolStepRecord(step: { kind: string; input?: unknown }): boolean {
  if (step.kind !== 'tool') return false
  return TaskToolStepPayloadSchema.safeParse(step.input).success
}
