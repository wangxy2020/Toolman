export { parseKnowledgeDocumentPermissionsFromPayload } from './p2p-knowledge-share-metadata'

export {
  shareP2pKnowledge,
  removeP2pKnowledgeDocuments,
  unshareP2pKnowledge,
  setP2pKnowledgeDocumentPermission,
  listP2pSharedResources,
  maybeSyncSharedKnowledgeDocument,
} from './knowledge-sync-share.service'

export {
  syncP2pKnowledgeDocument,
  materializeP2pKnowledgeDocumentForOpen,
  ensureP2pKnowledgeDocumentSaved,
} from './knowledge-sync-document.service'
