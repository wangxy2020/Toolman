import type { CSSProperties } from 'react'
import { MessagePanel } from '../chat/MessagePanel'
import { MessageInput } from '../chat/MessageInput'
import { messageFontSizePx, sendShortcutPlaceholder } from '../chat/message-settings'
import type { MessageSettings } from '../chat/message-settings'
import { useI18n } from '../../i18n/useI18n'
import { useGroupChat } from './useGroupChat'

interface Props {
  workspaceId: string
  workspaceName: string
  selfMemberId: string | null
  isOwner: boolean
  canWriteWorkspace: boolean
  messageSettings: MessageSettings
  spellCheckEnabled?: boolean
  defaultFilePath?: string | null
}

export function GroupMemberChatPanel({
  workspaceId,
  workspaceName,
  selfMemberId,
  isOwner,
  canWriteWorkspace,
  messageSettings,
  spellCheckEnabled = true,
  defaultFilePath = null,
}: Props) {
  const { t } = useI18n()
  const chat = useGroupChat(workspaceId, selfMemberId)

  const messagePanelStyle: CSSProperties = {
    '--tm-message-font-size': `${messageFontSizePx(messageSettings.messageFontSize)}px`,
  } as CSSProperties

  return (
    <div
      className={[
        'tm-group-chat-panel',
        messageSettings.useSerifFont ? 'tm-main--serif' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={messagePanelStyle}
    >
      {chat.error ? (
        <div className="tm-error-bar">
          {chat.error}
          <button type="button" className="tm-error-dismiss" onClick={() => chat.setError(null)}>
            ×
          </button>
        </div>
      ) : null}

      <div className="tm-group-chat-messages-wrap">
        <MessagePanel
          messages={chat.messages}
          loading={chat.loading}
          assistantName={workspaceName}
          defaultModelId={null}
          messageSettings={messageSettings}
          sending={chat.sending}
          sendShortcut={messageSettings.sendShortcut}
          emptyTitle={t('groupPage.messages.emptyTitle')}
          emptyHint={t('groupPage.messages.emptyHint', {
            shortcut: sendShortcutPlaceholder(messageSettings.sendShortcut),
          })}
          loadingLabel={t('groupPage.messages.loading')}
          onDeleteMessage={(id) => void chat.deleteMessage(id)}
          onError={chat.setError}
          getUserDisplayName={chat.getUserDisplayName}
          getUserAvatarInitial={chat.getUserAvatarInitial}
          isOwnUserMessage={chat.isOwnUserMessage}
        />
      </div>

      <MessageInput
        disabled={!canWriteWorkspace || chat.sending}
        streaming={false}
        modelCount={1}
        defaultModelId={null}
        defaultFilePath={defaultFilePath}
        spellCheckEnabled={spellCheckEnabled}
        sendShortcut={messageSettings.sendShortcut}
        toolbarMode="group"
        groupIsOwner={isOwner}
        onSend={(contentBlocks) => void chat.sendMessage(contentBlocks)}
        onClearSession={isOwner ? () => void chat.clearMessages() : undefined}
        onAbort={() => undefined}
        onError={chat.setError}
      />
    </div>
  )
}
