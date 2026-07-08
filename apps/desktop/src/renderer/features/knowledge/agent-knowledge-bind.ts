import { isVectorizedKnowledgeBaseKind, type KnowledgeBase } from '@toolman/shared'

/** Knowledge bases that support vector search / RAG (excludes local_files storage-only). */
export function filterAgentBindableKnowledgeBases(items: KnowledgeBase[]): KnowledgeBase[] {
  return items.filter((kb) => isVectorizedKnowledgeBaseKind(kb.kind))
}
