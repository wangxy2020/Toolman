export function knowledgeSelectionKey(resourceId: string, documentId: string): string {
  return `${resourceId}:${documentId}`
}

export function parseKnowledgeSelectionKey(key: string): {
  resourceId: string
  documentId: string
} | null {
  const separator = key.indexOf(':')
  if (separator <= 0) return null
  return {
    resourceId: key.slice(0, separator),
    documentId: key.slice(separator + 1),
  }
}
