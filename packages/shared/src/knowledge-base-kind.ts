export const KNOWLEDGE_FOLDER_KINDS = ['local', 'network', 'local_files'] as const
export type KnowledgeFolderKind = (typeof KNOWLEDGE_FOLDER_KINDS)[number]

export function isVectorizedKnowledgeBaseKind(kind: string): boolean {
  return kind !== 'local_files'
}

export function isNetworkKnowledgeBaseKind(kind: string): boolean {
  return kind === 'network'
}

export function isLocalFilesKnowledgeBaseKind(kind: string): boolean {
  return kind === 'local_files'
}
