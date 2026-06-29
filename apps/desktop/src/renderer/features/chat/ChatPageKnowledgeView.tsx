import { KnowledgePage } from '../knowledge/KnowledgePage'
import type { ChatPageState } from './useChatPage'

export type ChatPageKnowledgeViewProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'knowledgeSection'
  | 'knowledge'
  | 'p2pSharedKnowledge'
  | 'knowledgeFolder'
  | 'networkKnowledgeFolder'
  | 'localFilesFolder'
  | 'systemPaths'
  | 'handleOpenNote'
  | 'handleChatWithKnowledgeFiles'
>

export function ChatPageKnowledgeView({
  workspaceId,
  knowledgeSection,
  knowledge,
  p2pSharedKnowledge,
  knowledgeFolder,
  networkKnowledgeFolder,
  localFilesFolder,
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
      sharedKnowledgeEntries={p2pSharedKnowledge.entries}
      knowledgeFolderPath={knowledgeFolder.path}
      knowledgeFolderLoading={knowledgeFolder.loading}
      knowledgeFolderError={knowledgeFolder.error}
      networkKnowledgeFolderPath={networkKnowledgeFolder.path}
      networkKnowledgeFolderLoading={networkKnowledgeFolder.loading}
      networkKnowledgeFolderError={networkKnowledgeFolder.error}
      localFilesFolderPath={localFilesFolder.path}
      localFilesFolderLoading={localFilesFolder.loading}
      localFilesFolderError={localFilesFolder.error}
      loading={knowledge.loading}
      error={knowledge.error}
      onKbChanged={() => void knowledge.load()}
      onKnowledgeFolderPathChanged={(path) => void knowledgeFolder.updatePath(path)}
      onKnowledgeFolderError={knowledgeFolder.setError}
      onNetworkKnowledgeFolderPathChanged={(path) => void networkKnowledgeFolder.updatePath(path)}
      onNetworkKnowledgeFolderError={networkKnowledgeFolder.setError}
      onLocalFilesFolderPathChanged={(path) => void localFilesFolder.updatePath(path)}
      onLocalFilesFolderError={localFilesFolder.setError}
      systemPaths={systemPaths}
      onOpenNote={handleOpenNote}
      onChatWithKnowledgeFiles={(items) => void handleChatWithKnowledgeFiles(items)}
    />
  )
}
