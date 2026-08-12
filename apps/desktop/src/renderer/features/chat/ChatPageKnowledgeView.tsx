import { KnowledgePage } from '../knowledge/KnowledgePage'
import type { ChatPageState } from './useChatPage'

type ChatPageKnowledgeViewProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'knowledgeSection'
  | 'knowledge'
  | 'knowledgeFolder'
  | 'networkKnowledgeFolder'
  | 'localFilesFolder'
  | 'syncKnowledgeFolder'
  | 'systemPaths'
  | 'handleOpenNote'
  | 'handleChatWithKnowledgeFiles'
>

export function ChatPageKnowledgeView({
  workspaceId,
  knowledgeSection,
  knowledge,
  knowledgeFolder,
  networkKnowledgeFolder,
  localFilesFolder,
  syncKnowledgeFolder,
  systemPaths,
  handleOpenNote,
  handleChatWithKnowledgeFiles,
}: ChatPageKnowledgeViewProps) {
  return (
    <KnowledgePage
      workspaceId={workspaceId}
      section={knowledgeSection}
      activeId={knowledge.activeId}
      active={knowledge.active}
      knowledgeFolderPath={knowledgeFolder.path}
      knowledgeFolderLoading={knowledgeFolder.loading}
      knowledgeFolderError={knowledgeFolder.error}
      networkKnowledgeFolderPath={networkKnowledgeFolder.path}
      networkKnowledgeFolderLoading={networkKnowledgeFolder.loading}
      networkKnowledgeFolderError={networkKnowledgeFolder.error}
      localFilesFolderPath={localFilesFolder.path}
      localFilesFolderLoading={localFilesFolder.loading}
      localFilesFolderError={localFilesFolder.error}
      syncKnowledgeFolderPath={syncKnowledgeFolder.path}
      syncKnowledgeFolderLoading={syncKnowledgeFolder.loading}
      syncKnowledgeFolderError={syncKnowledgeFolder.error}
      knowledgeItems={knowledge.items}
      loading={knowledge.loading}
      error={knowledge.error}
      onKbChanged={() => void knowledge.load()}
      onKnowledgeFolderPathChanged={(path) => void knowledgeFolder.updatePath(path)}
      onKnowledgeFolderError={knowledgeFolder.setError}
      onNetworkKnowledgeFolderPathChanged={(path) => void networkKnowledgeFolder.updatePath(path)}
      onNetworkKnowledgeFolderError={networkKnowledgeFolder.setError}
      onLocalFilesFolderPathChanged={(path) => void localFilesFolder.updatePath(path)}
      onLocalFilesFolderError={localFilesFolder.setError}
      onSyncKnowledgeFolderPathChanged={(path) => void syncKnowledgeFolder.updatePath(path)}
      onSyncKnowledgeFolderError={syncKnowledgeFolder.setError}
      systemPaths={systemPaths}
      onOpenNote={handleOpenNote}
      onChatWithKnowledgeFiles={(items) => void handleChatWithKnowledgeFiles(items)}
    />
  )
}
