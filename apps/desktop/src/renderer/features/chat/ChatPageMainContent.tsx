import type { ChatPageState } from './useChatPage'
import { ChatPageAgentView } from './ChatPageAgentView'
import { ChatPageKnowledgeView } from './ChatPageKnowledgeView'
import { ChatPageNotesView } from './ChatPageNotesView'
import { ChatPageGroupView } from './ChatPageGroupView'
import { ChatPageCommunityView } from './ChatPageCommunityView'
import { ChatPageModuleView } from './ChatPageModuleView'
import { ChatPageSettingsView } from './ChatPageSettingsView'

type ChatPageMainContentProps = Pick<
  ChatPageState,
  | 'activeView'
  | 'messageSettings'
  | 'messagePanelStyle'
  | 'activeAssistant'
  | 'workspace'
  | 'chat'
  | 'headerModelIds'
  | 'handleModelChange'
  | 'handleSelectWorkspaceFolder'
  | 'handleCodeEditorChange'
  | 'handleToggleMessageSettings'
  | 'setShowAgentSettings'
  | 'showMessageSettings'
  | 'handleOpenSettings'
  | 'groupProxyMode'
  | 'statusMessage'
  | 'setStatusMessage'
  | 'defaultModelId'
  | 'translationLanguages'
  | 'appSettings'
  | 'systemPaths'
  | 'groupProxyReadOnly'
  | 'agentPrefillText'
  | 'agentPrefillAttachments'
  | 'chatPrefillRevision'
  | 'handleEditUserMessage'
  | 'handlePrefillConsumed'
  | 'updateAppSettings'
  | 'notes'
  | 'setActiveView'
  | 'workspaceId'
  | 'knowledgeSection'
  | 'knowledge'
  | 'knowledgeFolder'
  | 'networkKnowledgeFolder'
  | 'localFilesFolder'
  | 'handleOpenNote'
  | 'handleChatWithKnowledgeFiles'
  | 'handleChatWithNote'
  | 'setNotesIngestTarget'
  | 'p2pWorkspaces'
  | 'handleP2pWorkspaceUpdated'
  | 'handleP2pWorkspaceLeft'
  | 'handleOpenGroupNote'
  | 'handleSyncGroupNoteLock'
  | 'handleOpenGroupKnowledgeMarkdown'
  | 'handleSaveGroupNoteAsCopy'
  | 'handleOpenGroupAgentSession'
  | 'handleReloadAssistants'
  | 'registrationGate'
  | 'setShowGroupInvite'
  | 'setShowMembershipUpgrade'
  | 'communityAction'
  | 'communitySidebarSection'
  | 'settingsSection'
  | 'updateMessageSettings'
  | 'resetSettings'
  | 'setShowMessageSettings'
  | 'isModuleView'
>

export function ChatPageMainContent(props: ChatPageMainContentProps) {
  const { activeView, isModuleView } = props

  if (activeView === 'agent') {
    return <ChatPageAgentView {...props} />
  }

  if (activeView === 'knowledge') {
    return <ChatPageKnowledgeView {...props} />
  }

  if (activeView === 'notes') {
    return <ChatPageNotesView {...props} />
  }

  if (activeView === 'group') {
    return <ChatPageGroupView {...props} />
  }

  if (activeView === 'community') {
    return <ChatPageCommunityView {...props} />
  }

  if (isModuleView(activeView)) {
    return <ChatPageModuleView activeView={activeView} />
  }

  return <ChatPageSettingsView {...props} />
}
