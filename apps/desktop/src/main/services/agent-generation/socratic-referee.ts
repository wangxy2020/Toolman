import {
  looksLikeSocraticAnswerLeak,
  resolveAssistantLibTeachingRuntime,
  stripSocraticMachineBlocks,
} from '@toolman/shared'
import type { getAssistantRow } from '../assistant.service'
import { getSession } from '../session.service'
import type { GenerationStreamContext } from './types'

function parseAssistantParams(assistant: ReturnType<typeof getAssistantRow>): Record<string, unknown> {
  if (!assistant) return {}
  try {
    return JSON.parse(assistant.parametersJson) as Record<string, unknown>
  } catch {
    return {}
  }
}

function buildLeakRewrite(original: string): string {
  const cleaned = stripSocraticMachineBlocks(original)
  const firstLine = cleaned.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const hint = firstLine.slice(0, 80)
  return [
    '我们先放慢一步——直接给结论会短路你的思考。',
    hint
      ? `围绕你刚才触及的点（「${hint}」），换一个角度：`
      : '请先自己组织一下：',
    '如果去掉你最想依赖的那个前提，论证还成立吗？你愿意先说出你的假设吗？',
    '',
    '```socratic-card',
    'confirmed: 无',
    'assumption: 需要先澄清关键前提',
    '```',
  ].join('\n')
}

/**
 * Post-generation referee: if a Socratic assistant dumped answers, rewrite.
 * Heuristic-first (stable, no extra model call). Gated by teachingMode + refereeEnabled
 * (prefer per-course session metadata when present).
 */
export function maybeApplySocraticReferee(options: {
  assistant: ReturnType<typeof getAssistantRow>
  sessionId?: string
  stream: GenerationStreamContext
}): boolean {
  const session = options.sessionId ? getSession({ id: options.sessionId }) : null
  const runtime = resolveAssistantLibTeachingRuntime({
    sessionMetadata: session?.metadata,
    assistantParameters: parseAssistantParams(options.assistant),
  })
  if (runtime.teachingMode !== 'socratic') return false
  if (!runtime.refereeEnabled) return false

  const draft = options.stream.buffers.plainText()
  if (!looksLikeSocraticAnswerLeak(draft)) return false

  const rewritten = buildLeakRewrite(draft)
  options.stream.buffers.replacePlainText(rewritten)
  options.stream.persistBlocks(true)
  return true
}
