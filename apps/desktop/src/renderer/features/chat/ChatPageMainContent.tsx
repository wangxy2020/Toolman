import type { ChatPageState } from './useChatPage'
import { ChatPageAgentView } from './ChatPageAgentView'
import { ChatPageKnowledgeView } from './ChatPageKnowledgeView'
import { ChatPageNotesView } from './ChatPageNotesView'
import { ChatPageGroupView } from './ChatPageGroupView'
import { ChatPageCommunityView } from './ChatPageCommunityView'
import { ChatPageProjectsView } from './ChatPageProjectsView'
import { ChatPageModuleView } from './ChatPageModuleView'
import { ChatPageTranslateView } from './ChatPageTranslateView'
import { ChatPageAssistantLibView } from './ChatPageAssistantLibView'
import { ChatPageSettingsView } from './ChatPageSettingsView'

type ChatPageMainContentProps = Pick<
  ChatPageState,
  | 'activeView'
  | 'messageSettings'
  | 'messagePanelStyle'
  | 'activeAssistant'
  | 'workspace'
  | 'chat'
  | 'agentTaskPanel'
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
  | 'projectSidebarTab'
  | 'translationSection'
  | 'translationWorkspaceKey'
  | 'translation'
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

  if (activeView === 'projects') {
    return (
      <ChatPageProjectsView
        activeTab={props.projectSidebarTab}
        agentContext={{
          workspaceId: props.workspaceId,
          workspace: props.workspace,
          chat: props.chat,
          messageSettings: props.messageSettings,
          messagePanelStyle: props.messagePanelStyle,
          defaultModelId: props.defaultModelId,
          translationLanguages: props.translationLanguages,
          groupProxyReadOnly: props.groupProxyReadOnly,
          appSettings: props.appSettings,
          systemPaths: props.systemPaths,
          agentPrefillText: props.agentPrefillText,
          agentPrefillAttachments: props.agentPrefillAttachments,
          chatPrefillRevision: props.chatPrefillRevision,
          handleEditUserMessage: props.handleEditUserMessage,
          handlePrefillConsumed: props.handlePrefillConsumed,
          updateAppSettings: props.updateAppSettings,
          notes: props.notes,
          setActiveView: props.setActiveView,
        }}
      />
    )
  }

  if (activeView === 'translate') {
    return (
      <ChatPageTranslateView
        workspaceId={props.workspaceId}
        translationSection={props.translationSection}
        translationWorkspaceKey={props.translationWorkspaceKey}
        translation={props.translation}
        providers={props.chat.providers}
        translationLanguages={props.translationLanguages}
        notes={props.notes}
        setActiveView={props.setActiveView}
      />
    )
  }

  if (activeView === 'assistant-lib') {
    return (
      <ChatPageAssistantLibView
        workspaceId={props.workspaceId}
        chat={props.chat}
        messageSettings={props.messageSettings}
        defaultModelId={props.defaultModelId}
        translationLanguages={props.translationLanguages}
        groupProxyReadOnly={props.groupProxyReadOnly}
        appSettings={props.appSettings}
        systemPaths={props.systemPaths}
        agentPrefillText={props.agentPrefillText}
        agentPrefillAttachments={props.agentPrefillAttachments}
        chatPrefillRevision={props.chatPrefillRevision}
        handleEditUserMessage={props.handleEditUserMessage}
        handlePrefillConsumed={props.handlePrefillConsumed}
        updateAppSettings={props.updateAppSettings}
        notes={props.notes}
        setActiveView={props.setActiveView}
        handleReloadAssistants={props.handleReloadAssistants}
        setStatusMessage={props.setStatusMessage}
        knowledgeFolder={props.knowledgeFolder}
      />
    )
  }

  if (isModuleView(activeView)) {
    return <ChatPageModuleView activeView={activeView} />
  }

  return <ChatPageSettingsView {...props} />
}
