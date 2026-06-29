import type { Message } from '@toolman/shared'
import {
  IconCopy,
  IconGitFork,
  IconRefresh,
  IconSaveNote,
  IconTrash,
  IconTranslate,
} from '../../components/icons'
import { modelNameFromId } from './model-utils'
import {
  formatAssistantTokens,
  formatMessageTime,
  getMessageText,
} from './message-utils'
import { hasMessageError } from './message-error-utils'
import { MessageErrorBanner } from './MessageErrorBanner'
import { translationLanguageLabel } from './translation-utils'
import type { MessageSettings } from './message-settings'
import { MessageContent } from './MessageContent'
import { MessageMarkdown } from './MessageMarkdown'
import { MessagePanelActionButton } from './MessagePanelActionButton'
import type { MessageTranslation } from './message-panel-types'

export function MessagePanelAssistantMessage({
  message,
  assistantName,
  defaultModelId,
  messageSettings,
  sending,
  onDelete,
  onCopy,
  onRegenerate,
  onFork,
  onSaveToNote,
  copied,
  translation,
  translationVisible,
  translating,
  onTranslate,
  deleting,
  forking,
  regenerating,
}: {
  message: Message
  assistantName: string
  defaultModelId: string | null
  messageSettings: MessageSettings
  sending?: boolean
  onDelete: (id: string, anchor: HTMLElement) => void
  onCopy: () => void
  onRegenerate?: () => void
  onFork?: () => void
  onSaveToNote?: () => void
  copied: boolean
  translation?: MessageTranslation
  translationVisible: boolean
  translating: boolean
  onTranslate: () => void
  deleting?: boolean
  forking?: boolean
  regenerating?: boolean
}) {
  const text = getMessageText(message)
  const tokenLabel = formatAssistantTokens(message)
  const modelLabel = message.modelId ? modelNameFromId(message.modelId) : null
  const displayName = modelLabel ? `${assistantName} · ${modelLabel}` : assistantName
  const canTranslate = Boolean(
    text.trim() && (message.modelId ?? defaultModelId) && message.status === 'completed',
  )
  const canRegenerate = Boolean(
    onRegenerate &&
      text.trim() &&
      (message.modelId ?? defaultModelId) &&
      (message.status === 'completed' || message.status === 'failed' || message.status === 'aborted') &&
      !sending &&
      !regenerating,
  )

  return (
    <article className="tm-stream-message tm-stream-message--assistant">
      <div className="tm-stream-message-head">
        <div className="tm-stream-avatar tm-stream-avatar--assistant">A</div>
        <div className="tm-stream-meta">
          <div className="tm-stream-name">{displayName}</div>
          <div className="tm-stream-time">{formatMessageTime(message.createdAt)}</div>
        </div>
      </div>

      <div className="tm-stream-body">
        <div className="tm-stream-content">
          <MessageContent
            contentBlocks={message.contentBlocks}
            streaming={message.status === 'streaming'}
            settings={messageSettings}
          />
        </div>

        {translation && (
          <div className="tm-stream-translation">
            <div className="tm-stream-translation-label">
              译文（{translationLanguageLabel(translation.targetLanguage)}）
            </div>
            <div className="tm-stream-translation-text">
              <MessageMarkdown text={translation.text} settings={messageSettings} />
            </div>
          </div>
        )}

        {message.error && hasMessageError(message.status) && (
          <MessageErrorBanner
            error={message.error}
            modelId={message.modelId ?? defaultModelId}
            messageSettings={messageSettings}
          />
        )}

        {message.status !== 'streaming' && (
          <div className="tm-stream-footer">
            <div className="tm-stream-actions">
              <MessagePanelActionButton
                title={copied ? '已复制' : '复制'}
                disabled={!text.trim()}
                active={copied}
                onClick={onCopy}
              >
                <IconCopy size={15} />
              </MessagePanelActionButton>
              <MessagePanelActionButton
                title={
                  translating ? '翻译中…' : translationVisible ? '隐藏译文' : '翻译'
                }
                disabled={!canTranslate || translating}
                active={translating || translationVisible}
                onClick={onTranslate}
              >
                <IconTranslate size={15} className={translating ? 'tm-icon-spin' : undefined} />
              </MessagePanelActionButton>
              {onRegenerate ? (
                <MessagePanelActionButton
                  title="重新生成"
                  disabled={!canRegenerate}
                  loading={regenerating}
                  onClick={onRegenerate}
                >
                  <IconRefresh size={15} className={regenerating ? 'tm-icon-spin' : undefined} />
                </MessagePanelActionButton>
              ) : null}
              {onFork ? (
                <MessagePanelActionButton title="从此处分叉" loading={forking} onClick={onFork}>
                  <IconGitFork size={15} className={forking ? 'tm-icon-spin' : undefined} />
                </MessagePanelActionButton>
              ) : null}
              {onSaveToNote ? (
                <MessagePanelActionButton
                  title="保存到笔记"
                  disabled={!text.trim()}
                  onClick={onSaveToNote}
                >
                  <IconSaveNote size={15} />
                </MessagePanelActionButton>
              ) : null}
              <MessagePanelActionButton
                title="删除"
                loading={deleting}
                onClick={(event) => onDelete(message.id, event.currentTarget)}
              >
                <IconTrash size={15} className={deleting ? 'tm-icon-spin' : undefined} />
              </MessagePanelActionButton>
            </div>
            <div className="tm-stream-tokens">{tokenLabel}</div>
          </div>
        )}
      </div>
    </article>
  )
}
