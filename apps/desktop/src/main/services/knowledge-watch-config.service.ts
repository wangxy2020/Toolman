import {
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KnowledgeWatchConfigSchema,
  effectiveKnowledgeWatchExclude,
  effectiveKnowledgeWatchInclude,
} from '@toolman/shared'
import type { z } from 'zod'

type KnowledgeWatchConfig = z.infer<typeof KnowledgeWatchConfigSchema>

export function resolveKnowledgeWatchConfig(json: string): KnowledgeWatchConfig {
  let parsed: KnowledgeWatchConfig
  try {
    parsed = KnowledgeWatchConfigSchema.parse(JSON.parse(json))
  } catch {
    parsed = DEFAULT_KNOWLEDGE_WATCH_CONFIG
  }

  return {
    ...parsed,
    include: effectiveKnowledgeWatchInclude(parsed.include),
    exclude: effectiveKnowledgeWatchExclude(parsed.exclude),
  }
}
