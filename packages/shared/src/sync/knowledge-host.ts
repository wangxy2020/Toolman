import { z } from 'zod'
import { KnowledgeBaseKindSchema } from '../ipc/knowledge.js'

/** Mobile → desktop host payload for `knowledge-search` capability. */
export const KnowledgeHostRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('list-meta') }),
  z.object({
    op: z.literal('search'),
    query: z.string().min(1),
    kbId: z.string().optional(),
    limit: z.number().int().positive().max(50).default(8),
  }),
])
export type KnowledgeHostRequest = z.infer<typeof KnowledgeHostRequestSchema>

export const KnowledgeMetaItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: KnowledgeBaseKindSchema.or(z.string()),
  documentCount: z.number().int().nonnegative().default(0),
  updatedAt: z.number().int().nonnegative().optional(),
})
export type KnowledgeMetaItem = z.infer<typeof KnowledgeMetaItemSchema>

export const KnowledgeHostListMetaResponseSchema = z.object({
  op: z.literal('list-meta'),
  items: z.array(KnowledgeMetaItemSchema),
})

export const KnowledgeHostSearchHitSchema = z.object({
  documentTitle: z.string(),
  kbName: z.string(),
  score: z.number(),
  text: z.string(),
  sourcePath: z.string().nullable().optional(),
})

export const KnowledgeHostSearchResponseSchema = z.object({
  op: z.literal('search'),
  items: z.array(KnowledgeHostSearchHitSchema),
})
