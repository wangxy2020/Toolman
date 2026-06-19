import type { chunks, documents, documentSources } from '../schema/knowledge.js'

export type KnowledgeBaseRow = typeof import('../schema/knowledge.js').knowledgeBases.$inferSelect
export type DocumentSourceRow = typeof documentSources.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type ChunkRow = typeof chunks.$inferSelect
