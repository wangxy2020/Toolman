import {
  isLocalFilesKnowledgeBaseKind,
  isNetworkKnowledgeBaseKind,
  isSharedKnowledgeBaseKind,
  isSyncKnowledgeBaseKind,
  isVectorizedKnowledgeBaseKind,
  type KnowledgeFolderKind,
} from './knowledge-base-kind.js'

/** How a knowledge base obtains source content. */
export const KNOWLEDGE_SOURCE_TYPES = ['file', 'url', 'p2p', 'import'] as const
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number]

/** Where the knowledge base's files live relative to the workspace. */
export const KNOWLEDGE_STORAGE_SCOPES = ['private', 'workspace', 'shared'] as const
export type KnowledgeStorageScope = (typeof KNOWLEDGE_STORAGE_SCOPES)[number]

/** Which clients may receive a portable snapshot of this knowledge base. */
export const KNOWLEDGE_SYNC_POLICIES = ['none', 'mobile', 'p2p'] as const
export type KnowledgeSyncPolicy = (typeof KNOWLEDGE_SYNC_POLICIES)[number]

/** Whether Agent RAG / hybrid search may use this knowledge base. */
export const KNOWLEDGE_RETRIEVAL_POLICIES = ['enabled', 'disabled'] as const
export type KnowledgeRetrievalPolicy = (typeof KNOWLEDGE_RETRIEVAL_POLICIES)[number]

export interface KnowledgeKindPolicy {
  kind: KnowledgeFolderKind
  sourceType: KnowledgeSourceType
  storageScope: KnowledgeStorageScope
  syncPolicy: KnowledgeSyncPolicy
  retrievalPolicy: KnowledgeRetrievalPolicy
  acceptsLocalFiles: boolean
  acceptsUrls: boolean
}

const POLICIES: Record<KnowledgeFolderKind, KnowledgeKindPolicy> = {
  local: {
    kind: 'local',
    sourceType: 'file',
    storageScope: 'private',
    syncPolicy: 'none',
    retrievalPolicy: 'enabled',
    acceptsLocalFiles: true,
    acceptsUrls: false,
  },
  sync: {
    kind: 'sync',
    sourceType: 'file',
    storageScope: 'workspace',
    syncPolicy: 'mobile',
    retrievalPolicy: 'enabled',
    acceptsLocalFiles: true,
    acceptsUrls: false,
  },
  network: {
    kind: 'network',
    sourceType: 'url',
    storageScope: 'private',
    syncPolicy: 'none',
    retrievalPolicy: 'enabled',
    acceptsLocalFiles: false,
    acceptsUrls: true,
  },
  shared: {
    kind: 'shared',
    sourceType: 'p2p',
    storageScope: 'shared',
    syncPolicy: 'p2p',
    retrievalPolicy: 'enabled',
    acceptsLocalFiles: false,
    acceptsUrls: false,
  },
  local_files: {
    kind: 'local_files',
    sourceType: 'file',
    storageScope: 'private',
    syncPolicy: 'none',
    retrievalPolicy: 'disabled',
    acceptsLocalFiles: true,
    acceptsUrls: false,
  },
}

export function isKnowledgeFolderKind(kind: string): kind is KnowledgeFolderKind {
  return kind in POLICIES
}

/**
 * Compatibility mapping from the legacy `kind` column to source/storage/sync/retrieval
 * policies. Existing UI and IPC keep using `kind`; new code should prefer the policy fields.
 */
export function getKnowledgeKindPolicy(kind: string): KnowledgeKindPolicy {
  if (isKnowledgeFolderKind(kind)) {
    return POLICIES[kind]
  }
  return POLICIES.local
}

export function knowledgeKindAcceptsLocalFiles(kind: string): boolean {
  return getKnowledgeKindPolicy(kind).acceptsLocalFiles
}

export function knowledgeKindAcceptsUrls(kind: string): boolean {
  return getKnowledgeKindPolicy(kind).acceptsUrls
}

export function knowledgeKindAllowsRetrieval(kind: string): boolean {
  return getKnowledgeKindPolicy(kind).retrievalPolicy === 'enabled'
}

export function knowledgeKindSyncsToMobile(kind: string): boolean {
  return getKnowledgeKindPolicy(kind).syncPolicy === 'mobile'
}

/** @deprecated Prefer getKnowledgeKindPolicy; kept for call-site migration. */
export function legacyKnowledgeKindGuards(kind: string) {
  return {
    isVectorized: isVectorizedKnowledgeBaseKind(kind),
    isNetwork: isNetworkKnowledgeBaseKind(kind),
    isShared: isSharedKnowledgeBaseKind(kind),
    isLocalFiles: isLocalFilesKnowledgeBaseKind(kind),
    isSync: isSyncKnowledgeBaseKind(kind),
    policy: getKnowledgeKindPolicy(kind),
  }
}
