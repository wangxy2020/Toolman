import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { MessageSettingsPanel } from './MessageSettingsPanel'
import { getMessageText } from './message-utils'
import type { ChatPageState } from './useChatPage'

export type ChatPageAgentViewProps = Pick<
  ChatPageState,
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
  | 'updateMessageSettings'
  | 'resetSettings'
  | 'setShowMessageSettings'
>

export function ChatPageAgentView({
  messageSettings,
  messagePanelStyle,
  activeAssistant,
  workspace,
  chat,
  headerModelIds,
  handleModelChange,
  handleSelectWorkspaceFolder,
  handleCodeEditorChange,
  handleToggleMessageSettings,
  setShowAgentSettings,
  showMessageSettings,
  handleOpenSettings,
  groupProxyMode,
  statusMessage,
  setStatusMessage,
  defaultModelId,
  translationLanguages,
  appSettings,
  systemPaths,
  groupProxyReadOnly,
  agentPrefillText,
  agentPrefillAttachments,
  chatPrefillRevision,
  handleEditUserMessage,
  handlePrefillConsumed,
  updateAppSettings,
  notes,
  setActiveView,
  updateMessageSettings,
  resetSettings,
  setShowMessageSettings,
}: ChatPageAgentViewProps) {
  return (
    <>
      <main
        className={[
          'tm-main',
          messageSettings.useSerifFont ? 'tm-main--serif' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={messagePanelStyle}
      >
        <ChatHeader
          assistant={activeAssistant}
          workspace={workspace}
          providers={chat.providers}
          selectedModelIds={headerModelIds}
          onModelChange={handleModelChange}
          onSelectWorkspaceFolder={() => void handleSelectWorkspaceFolder()}
          onCodeEditorChange={(editorId) => void handleCodeEditorChange(editorId)}
          onOpenMessageSettings={handleToggleMessageSettings}
          onOpenAgentSettings={() => setShowAgentSettings(true)}
          messageSettingsOpen={showMessageSettings}
          hasConfiguredProvider={chat.hasConfiguredProvider}
          onOpenSettings={() => handleOpenSettings('model-service')}
          groupProxyMode={groupProxyMode}
        />

        {chat.error && (
          <div className="tm-error-bar">
            {chat.error}
            <button type="button" className="tm-error-dismiss" onClick={() => chat.setError(null)}>
              ×
            </button>
          </div>
        )}

        {statusMessage ? (
          <div className="tm-status-bar">
            {statusMessage}
            <button
              type="button"
              className="tm-error-dismiss"
              onClick={() => setStatusMessage(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <ChatComposer
          chat={chat}
          activeAssistantName={activeAssistant?.name ?? '智能体'}
          defaultModelId={defaultModelId}
          translationLanguages={translationLanguages}
          messageSettings={messageSettings}
          appSettings={appSettings}
          systemPaths={systemPaths}
          groupProxyReadOnly={groupProxyReadOnly}
          agentPrefillText={agentPrefillText}
          agentPrefillAttachments={agentPrefillAttachments}
          chatPrefillRevision={chatPrefillRevision}
          onEditUserMessage={(id) => handleEditUserMessage(id)}
          onPrefillConsumed={handlePrefillConsumed}
          onUpdateAppSettings={updateAppSettings}
          onCreateSession={() => void chat.createSession(activeAssistant?.id)}
          onClearSession={() => void chat.clearSessionMessages()}
          onSaveToNote={(messageId) => {
            const message = chat.messages.find((item) => item.id === messageId)
            if (!message) return
            const text = getMessageText(message)
            const firstLine = text.split('\n').find((line) => line.trim()) ?? ''
            const title = firstLine.slice(0, 48) || '对话摘录'
            notes.createNoteFromMessage(title, text)
            setActiveView('notes')
          }}
        />
      </main>

      {showMessageSettings && (
        <MessageSettingsPanel
          settings={messageSettings}
          onChange={updateMessageSettings}
          onReset={resetSettings}
          onClose={() => setShowMessageSettings(false)}
        />
      )}
    </>
  )
}
