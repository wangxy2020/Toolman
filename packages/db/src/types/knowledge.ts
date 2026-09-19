import type {
  chunks,
  documents,
  documentRevisions,
  documentSources,
  knowledgeIndexVersions,
} from '../schema/knowledge.js'

export type KnowledgeBaseRow = typeof import('../schema/knowledge.js').knowledgeBases.$inferSelect
export type DocumentSourceRow = typeof documentSources.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type ChunkRow = typeof chunks.$inferSelect
export type KnowledgeIndexVersionRow = typeof knowledgeIndexVersions.$inferSelect
export type DocumentRevisionRow = typeof documentRevisions.$inferSelect
