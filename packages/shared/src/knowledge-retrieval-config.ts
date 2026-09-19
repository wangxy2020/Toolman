import { z } from 'zod'

export const KnowledgeRetrievalConfigSchema = z.object({
  vectorWeight: z.number().min(0).max(1).default(0.65),
  ftsWeight: z.number().min(0).max(1).default(0.35),
  metadataWeight: z.number().min(0).max(2).default(0.15),
  pageWeight: z.number().min(0).max(4).default(1),
  titleWeight: z.number().min(0).max(4).default(1.2),
  titleMismatchPenalty: z.number().min(0).max(4).default(0.6),
  pageMismatchPenalty: z.number().min(0).max(4).default(0.5),
  rerankWeight: z.number().min(0).max(2).default(1),
  scoreThreshold: z.number().min(0).max(1).optional(),
})

export type KnowledgeRetrievalConfig = z.infer<typeof KnowledgeRetrievalConfigSchema>

export const DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG: KnowledgeRetrievalConfig =
  KnowledgeRetrievalConfigSchema.parse({})

export function parseKnowledgeRetrievalConfig(value: unknown): KnowledgeRetrievalConfig {
  if (value == null || value === '') {
    return DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG
  }
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
    return KnowledgeRetrievalConfigSchema.parse({
      ...DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    })
  } catch {
    return DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG
  }
}

export function mergeKnowledgeRetrievalConfig(
  stored: unknown,
  overrides?: Partial<KnowledgeRetrievalConfig> | null,
): KnowledgeRetrievalConfig {
  const base = parseKnowledgeRetrievalConfig(stored)
  if (!overrides) return base
  return KnowledgeRetrievalConfigSchema.parse({
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  })
}
