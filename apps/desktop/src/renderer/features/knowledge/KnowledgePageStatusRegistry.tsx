import { useRegisterModulePanelError } from '../../components/module-page-status'
import type { KnowledgePageStatusRegistryProps } from './knowledge-page-types'

export function KnowledgePageStatusRegistry({
  error,
  documentsError,
  onClearDocumentsError,
  knowledgeFolderError,
  networkKnowledgeFolderError,
  localFilesFolderError,
  syncKnowledgeFolderError,
  localDefaultKbError,
  onClearLocalDefaultKbError,
  networkDefaultKbError,
  onClearNetworkDefaultKbError,
  syncDefaultKbError,
  onClearSyncDefaultKbError,
  localFilesDefaultKbError,
  onClearLocalFilesDefaultKbError,
}: KnowledgePageStatusRegistryProps) {
  useRegisterModulePanelError('knowledge-bases', error ?? null)
  useRegisterModulePanelError('knowledge-documents', documentsError, onClearDocumentsError)
  useRegisterModulePanelError('knowledge-folder-local', knowledgeFolderError ?? null)
  useRegisterModulePanelError('knowledge-folder-network', networkKnowledgeFolderError ?? null)
  useRegisterModulePanelError('knowledge-folder-local-files', localFilesFolderError ?? null)
  useRegisterModulePanelError('knowledge-folder-sync', syncKnowledgeFolderError ?? null)
  useRegisterModulePanelError(
    'knowledge-default-local',
    localDefaultKbError,
    onClearLocalDefaultKbError,
  )
  useRegisterModulePanelError(
    'knowledge-default-network',
    networkDefaultKbError,
    onClearNetworkDefaultKbError,
  )
  useRegisterModulePanelError(
    'knowledge-default-sync',
    syncDefaultKbError,
    onClearSyncDefaultKbError,
  )
  useRegisterModulePanelError(
    'knowledge-default-local-files',
    localFilesDefaultKbError,
    onClearLocalFilesDefaultKbError,
  )

  return null
}
