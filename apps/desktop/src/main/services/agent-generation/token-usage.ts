import type { Message } from '@toolman/shared'

export function estimateTokenUsage(
  promptText: string,
  completionText: string,
): NonNullable<Message['tokenUsage']> {
  const prompt = Math.max(1, Math.ceil(promptText.length / 4))
  const completion = Math.max(1, Math.ceil(completionText.length / 4))
  return { prompt, completion, total: prompt + completion }
}
