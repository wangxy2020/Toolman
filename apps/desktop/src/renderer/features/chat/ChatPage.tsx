import { AppNavBar } from '../../components/layout/AppNavBar'
import { WindowChromeBar } from '../../components/layout/WindowChromeBar'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ChatPageMainContent } from './ChatPageMainContent'
import { ChatPageModals } from './ChatPageModals'
import { ChatPageSidebars } from './ChatPageSidebars'
import { useChatPage } from './useChatPage'
import type { ChatPageProps } from './chat-page-types'

export type { ChatPageProps } from './chat-page-types'

export function ChatPage({ appSettings, updateAppSettings }: ChatPageProps) {
  const page = useChatPage({ appSettings, updateAppSettings })

  return (
    <ErrorBoundary title={page.t('errors.chat')}>
      <div className="tm-shell">
        {page.isTopNav ? (
          <AppNavBar
            layout="top"
            activeView={page.activeView}
            appSettings={page.appSettings}
            sidebarVisible={page.sidebarVisible}
            onToggleSidebar={page.handleToggleSidebar}
            searchEnabled
            searchTitle={page.chromeSearchTitle}
            onOpenSearch={() => page.setShowSearch(true)}
            onNavigate={page.handleNavigate}
            onThemeChange={(theme) => page.updateAppSettings({ theme })}
          />
        ) : (
          <WindowChromeBar
            sidebarVisible={page.sidebarVisible}
            onToggleSidebar={page.handleToggleSidebar}
            searchEnabled
            searchTitle={page.chromeSearchTitle}
            onOpenSearch={() => page.setShowSearch(true)}
          />
        )}

        <div className="tm-body">
          {!page.isTopNav && (
            <AppNavBar
              activeView={page.activeView}
              appSettings={page.appSettings}
              onNavigate={page.handleNavigate}
              onThemeChange={(theme) => page.updateAppSettings({ theme })}
            />
          )}

          <div className="tm-body-main">
            <ChatPageSidebars
              showContentSidebar={page.showContentSidebar}
              activeView={page.activeView}
              sidebarAssistants={page.sidebarAssistants}
              chat={page.chat}
              handleDeleteAssistant={page.handleDeleteAssistant}
              setShowAssistants={page.setShowAssistants}
              knowledge={page.knowledge}
              p2pSharedKnowledge={page.p2pSharedKnowledge}
              knowledgeSection={page.knowledgeSection}
              setKnowledgeSection={page.setKnowledgeSection}
              setShowKnowledgeCreate={page.setShowKnowledgeCreate}
              notes={page.notes}
              setNotesIngestTarget={page.setNotesIngestTarget}
              communitySidebarSection={page.communitySidebarSection}
              setCommunitySidebarSection={page.setCommunitySidebarSection}
              setCommunityAction={page.setCommunityAction}
              p2pWorkspaces={page.p2pWorkspaces}
              registrationGate={page.registrationGate}
              setShowGroupCreate={page.setShowGroupCreate}
              setShowGroupJoin={page.setShowGroupJoin}
              setPendingJoinCancelId={page.setPendingJoinCancelId}
              setShowGroupJoinPending={page.setShowGroupJoinPending}
            />
            <ChatPageMainContent
              activeView={page.activeView}
              messageSettings={page.messageSettings}
              messagePanelStyle={page.messagePanelStyle}
              activeAssistant={page.activeAssistant}
              workspace={page.workspace}
              chat={page.chat}
              headerModelIds={page.headerModelIds}
              handleModelChange={page.handleModelChange}
              handleSelectWorkspaceFolder={page.handleSelectWorkspaceFolder}
              handleCodeEditorChange={page.handleCodeEditorChange}
              handleToggleMessageSettings={page.handleToggleMessageSettings}
              setShowAgentSettings={page.setShowAgentSettings}
              showMessageSettings={page.showMessageSettings}
              handleOpenSettings={page.handleOpenSettings}
              groupProxyMode={page.groupProxyMode}
              statusMessage={page.statusMessage}
              setStatusMessage={page.setStatusMessage}
              defaultModelId={page.defaultModelId}
              translationLanguages={page.translationLanguages}
              appSettings={page.appSettings}
              systemPaths={page.systemPaths}
              groupProxyReadOnly={page.groupProxyReadOnly}
              agentPrefillText={page.agentPrefillText}
              agentPrefillAttachments={page.agentPrefillAttachments}
              chatPrefillRevision={page.chatPrefillRevision}
              handleEditUserMessage={page.handleEditUserMessage}
              handlePrefillConsumed={page.handlePrefillConsumed}
              updateAppSettings={page.updateAppSettings}
              notes={page.notes}
              setActiveView={page.setActiveView}
              workspaceId={page.workspaceId}
              knowledgeSection={page.knowledgeSection}
              knowledge={page.knowledge}
              p2pSharedKnowledge={page.p2pSharedKnowledge}
              knowledgeFolder={page.knowledgeFolder}
              networkKnowledgeFolder={page.networkKnowledgeFolder}
              localFilesFolder={page.localFilesFolder}
              handleOpenNote={page.handleOpenNote}
              handleChatWithKnowledgeFiles={page.handleChatWithKnowledgeFiles}
              handleChatWithNote={page.handleChatWithNote}
              setNotesIngestTarget={page.setNotesIngestTarget}
              p2pWorkspaces={page.p2pWorkspaces}
              handleP2pWorkspaceUpdated={page.handleP2pWorkspaceUpdated}
              handleP2pWorkspaceLeft={page.handleP2pWorkspaceLeft}
              handleOpenGroupNote={page.handleOpenGroupNote}
              handleSyncGroupNoteLock={page.handleSyncGroupNoteLock}
              handleOpenGroupKnowledgeMarkdown={page.handleOpenGroupKnowledgeMarkdown}
              handleSaveGroupNoteAsCopy={page.handleSaveGroupNoteAsCopy}
              handleOpenGroupAgentSession={page.handleOpenGroupAgentSession}
              handleReloadAssistants={page.handleReloadAssistants}
              registrationGate={page.registrationGate}
              setShowGroupInvite={page.setShowGroupInvite}
              setShowMembershipUpgrade={page.setShowMembershipUpgrade}
              communityAction={page.communityAction}
              communitySidebarSection={page.communitySidebarSection}
              settingsSection={page.settingsSection}
              updateMessageSettings={page.updateMessageSettings}
              resetSettings={page.resetSettings}
              setShowMessageSettings={page.setShowMessageSettings}
              isModuleView={page.isModuleView}
            />
          </div>
        </div>

        <ChatPageModals
          showSearch={page.showSearch}
          setShowSearch={page.setShowSearch}
          workspaceId={page.workspaceId}
          chat={page.chat}
          notes={page.notes}
          knowledge={page.knowledge}
          setActiveView={page.setActiveView}
          setKnowledgeSection={page.setKnowledgeSection}
          notesIngestTarget={page.notesIngestTarget}
          setNotesIngestTarget={page.setNotesIngestTarget}
          setStatusMessage={page.setStatusMessage}
          showAgentSettings={page.showAgentSettings}
          setShowAgentSettings={page.setShowAgentSettings}
          activeAssistant={page.activeAssistant}
          workspace={page.workspace}
          showAssistants={page.showAssistants}
          setShowAssistants={page.setShowAssistants}
          handleAssistantCreated={page.handleAssistantCreated}
          showKnowledgeCreate={page.showKnowledgeCreate}
          setShowKnowledgeCreate={page.setShowKnowledgeCreate}
          knowledgeFolder={page.knowledgeFolder}
          networkKnowledgeFolder={page.networkKnowledgeFolder}
          localFilesFolder={page.localFilesFolder}
          showGroupCreate={page.showGroupCreate}
          setShowGroupCreate={page.setShowGroupCreate}
          p2pWorkspaces={page.p2pWorkspaces}
          showGroupJoin={page.showGroupJoin}
          setShowGroupJoin={page.setShowGroupJoin}
          setPendingJoinCancelId={page.setPendingJoinCancelId}
          setShowGroupJoinPending={page.setShowGroupJoinPending}
          showGroupJoinPending={page.showGroupJoinPending}
          pendingJoinCancelId={page.pendingJoinCancelId}
          setShowMembershipUpgrade={page.setShowMembershipUpgrade}
          showMembershipUpgrade={page.showMembershipUpgrade}
          showGroupInvite={page.showGroupInvite}
          setShowGroupInvite={page.setShowGroupInvite}
          registrationGate={page.registrationGate}
        />
      </div>
    </ErrorBoundary>
  )
}
