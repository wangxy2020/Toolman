import { isP2pSharedKnowledgeMirrorDescription, type KnowledgeBase, type P2pSharedResource } from '@toolman/shared'

/** Knowledge base kinds that can be shared into a P2P group. */
export const GROUP_SHAREABLE_KB_KINDS = new Set<KnowledgeBase['kind']>([
  'local',
  'network',
  'local_files',
])

/** `undefined` = not shared; `null` = whole knowledge base shared; `string[]` = partially shared document ids */
export type SharedDocumentState = string[] | null | undefined

export function buildSharedDocumentMap(
  sharedResources: P2pSharedResource[],
): Map<string, SharedDocumentState> {
  const map = new Map<string, SharedDocumentState>()
  for (const resource of sharedResources) {
    if (resource.resourceType !== 'Knowledge') continue
    const kbId = resource.localResourceId ?? resource.id
    map.set(kbId, resource.sharedDocumentIds ?? null)
  }
  return map
}

function isSelectableKnowledgeBase(kb: KnowledgeBase): boolean {
  if (!GROUP_SHAREABLE_KB_KINDS.has(kb.kind)) return false
  if (isP2pSharedKnowledgeMirrorDescription(kb.description)) return false
  if (/^\[[^\]]+\]\s/.test(kb.name)) return false
  return true
}

export function listShareableKnowledgeBases(
  knowledgeBases: KnowledgeBase[],
  sharedResources: P2pSharedResource[],
): KnowledgeBase[] {
  const sharedDocumentMap = buildSharedDocumentMap(sharedResources)

  return knowledgeBases.filter((kb) => {
    if (!isSelectableKnowledgeBase(kb)) return false

    const shared = sharedDocumentMap.get(kb.id)
    if (shared === undefined) return true
    if (shared === null) return false
    return kb.documentCount > shared.length
  })
}

export function hasShareableKnowledgeBases(
  knowledgeBases: KnowledgeBase[],
  sharedResources: P2pSharedResource[],
): boolean {
  return listShareableKnowledgeBases(knowledgeBases, sharedResources).length > 0
}
