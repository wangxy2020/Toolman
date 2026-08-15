import { AssistantLibChatPanel } from './AssistantLibChatPanel'
import { AssistantLibClassroomRecords } from './AssistantLibClassroomRecords'
import { AssistantLibCreateCourseDialog } from './AssistantLibCreateCourseDialog'
import { AssistantLibSettingsDialog } from './AssistantLibSettingsDialog'
import { AssistantLibToolbar } from './AssistantLibToolbar'
import { setAssistantLibPanelView } from './assistant-lib-panel-view'
import type { AssistantLibPageProps } from './assistant-lib-page-types'
import { useAssistantLibPage } from './hooks/useAssistantLibPage'
import './assistant-lib.css'

export type { AssistantLibPageProps }
export { useAssistantLibPage } from './hooks/useAssistantLibPage'

export function AssistantLibPage(props: AssistantLibPageProps) {
  const {
    t,
    ui,
    panelView,
    knowledgeBases,
    submittingCourse,
    learningSessions,
    busy,
    error,
    activeLearningSession,
    reloadKnowledgeBases,
    handleDeleteLearningSession,
    handleStart,
    shareSummary,
    handleToggleClass,
    classLive,
    showRecords,
    secondaryLabel,
    closeAssistantLibCreateCourse,
    closeAssistantLibSettings,
  } = useAssistantLibPage(props)

  return (
    <main
      className={[
        'tm-main',
        'tm-project-manager-page',
        'tm-alib-page',
        showRecords ? '' : 'tm-project-manager-page--agent',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{t('assistantLibPage.title')}</span>
          <span className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {secondaryLabel}
            </span>
          </span>
        </div>
        <div className="tm-chat-header-end">
          <AssistantLibToolbar
            activeView={panelView}
            shareDisabled={!activeLearningSession}
            classLive={classLive}
            classToggleDisabled={!activeLearningSession}
            onToggleClass={() => void handleToggleClass()}
            onShareGroup={async () => {
              await navigator.clipboard.writeText(shareSummary())
              props.setStatusMessage?.(t('assistantLibPage.shareCopied'))
              props.setActiveView('group')
            }}
          />
        </div>
      </header>

      {error ? <div className="tm-error-bar">{error}</div> : null}

      {showRecords ? (
        <AssistantLibClassroomRecords
          session={activeLearningSession}
          onOpenSession={(sessionId) => {
            void props.chat.selectSession(sessionId)
            setAssistantLibPanelView('agent')
          }}
        />
      ) : (
        <div className="tm-pm-agent-root">
          <AssistantLibChatPanel
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
          />
        </div>
      )}

      {ui.createCourseOpen && props.workspaceId ? (
        <AssistantLibCreateCourseDialog
          workspaceId={props.workspaceId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={props.knowledgeFolder.path}
          busy={busy || submittingCourse}
          onClose={closeAssistantLibCreateCourse}
          onStart={handleStart}
        />
      ) : null}

      {ui.settingsOpen && props.workspaceId ? (
        <AssistantLibSettingsDialog
          workspaceId={props.workspaceId}
          sessions={learningSessions}
          activeSessionId={props.chat.activeSessionId}
          knowledgeBases={knowledgeBases}
          defaultLocalFolderPath={props.knowledgeFolder.path}
          onClose={closeAssistantLibSettings}
          onSaved={props.handleReloadAssistants}
          onKnowledgeBasesChanged={reloadKnowledgeBases}
          onStatusMessage={props.setStatusMessage}
          onDeleteSession={handleDeleteLearningSession}
          defaultModelId={props.defaultModelId}
        />
      ) : null}
    </main>
  )
}

export default AssistantLibPage
