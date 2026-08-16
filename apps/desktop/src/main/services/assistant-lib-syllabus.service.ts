import { fireAndForget } from '../lib/fire-and-forget'
import { AssistantLibSyllabusGenerateInputSchema } from '@toolman/shared'
import { runSyllabusGeneration } from './assistant-lib-syllabus-generate'

const inflight = new Set<string>()

export async function startAssistantLibSyllabusGeneration(input: unknown): Promise<{
  started: boolean
}> {
  const data = AssistantLibSyllabusGenerateInputSchema.parse(input)
  if (inflight.has(data.sessionId)) return { started: false }
  inflight.add(data.sessionId)
  fireAndForget(
    'assistant-lib',
    runSyllabusGeneration(data).finally(() => {
      inflight.delete(data.sessionId)
    }),
  )
  return { started: true }
}
