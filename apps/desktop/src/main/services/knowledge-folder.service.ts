export {
  getDefaultKnowledgeFolderPath,
  getDefaultLocalFilesFolderPath,
  getDefaultNetworkKnowledgeFolderPath,
  getDefaultSharedKnowledgeFolderPath,
  getDefaultSyncKnowledgeFolderPath,
  getDefaultWorkspaceFolderPath,
  getToolmanDocumentsRootPath,
  getToolmanUserFolderName,
  getToolmanUserRootPath,
  isStoredPathUnderDifferentUserFolder,
  ensureToolmanUserDocumentFolders,
  TOOLMAN_USER_DOCUMENT_SUBFOLDERS,
} from './toolman-user-documents.service'

export { resolveStoredFolderPath } from './knowledge-folder/types'
export {
  renameKnowledgeStorageFolder,
  migrateToolmanUserFolderPathsForWorkspace,
  migrateToolmanUserFolderPaths,
  migrateToolmanUserFolderBetweenSlugs,
} from './knowledge-folder/migration'
export {
  applyDocumentsFolderSlugAccountSync,
  bootstrapToolmanUserDocumentLayout,
  ensureWorkspaceKnowledgeFolder,
  getWorkspaceKnowledgeFolderPath,
  ensureWorkspaceNetworkKnowledgeFolder,
  getWorkspaceNetworkKnowledgeFolderPath,
  ensureWorkspaceSharedKnowledgeFolder,
  getWorkspaceSharedKnowledgeFolderPath,
  ensureWorkspaceSyncKnowledgeFolder,
  getWorkspaceSyncKnowledgeFolderPath,
  ensureWorkspaceLocalFilesFolder,
  getWorkspaceLocalFilesFolderPath,
  ensureKnowledgeBaseStoragePath,
} from './knowledge-folder/workspace-folders'
