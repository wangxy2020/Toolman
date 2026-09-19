import { knowledgeKindAllowsRetrieval } from './knowledge-kind-policy.js'

export type KnowledgeRetrievalBindingMode = 'explicit_allow' | 'default_allow' | 'explicit_deny'

export interface KnowledgeRetrievalScopeInput {
  searchableKbIds: string[]
  explicitAllow?: string[] | null
  explicitDeny?: string[] | null
  defaultAllowAll: boolean
}

/**
 * Agent retrieval scope:
 * Explicit Deny → Explicit Allow → Default (all searchable, or none).
 * `local_files` must already be excluded from searchableKbIds.
 */
export function resolveKnowledgeRetrievalScope(input: KnowledgeRetrievalScopeInput): string[] {
  const deny = new Set((input.explicitDeny ?? []).filter(Boolean))
  const searchable = input.searchableKbIds.filter((id) => !deny.has(id))

  const allow = (input.explicitAllow ?? []).filter((id) => id && !deny.has(id))
  if (allow.length > 0) {
    const allowSet = new Set(allow)
    return searchable.filter((id) => allowSet.has(id))
  }

  if (input.defaultAllowAll) {
    return searchable
  }

  return []
}

export function filterSearchableKnowledgeBaseIds<T extends { id: string; kind: string }>(
  rows: T[],
): string[] {
  return rows.filter((row) => knowledgeKindAllowsRetrieval(row.kind)).map((row) => row.id)
}
