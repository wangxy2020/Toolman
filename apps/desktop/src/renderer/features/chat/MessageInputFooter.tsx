import { IconMic, IconSend, IconTranslate } from '../../components/icons'
import { getSystemVoiceInputTitle } from './system-voice-input'
import type { useMessageInput } from './useMessageInput'

type MessageInputState = ReturnType<typeof useMessageInput>

export function MessageInputFooter({
  input,
  defaultModelId,
}: {
  input: MessageInputState
  defaultModelId: string | null
}) {
  const {
    t,
    disabled,
    streaming,
    text,
    translating,
    voiceHint,
    canSend,
    onAbort,
    handleTranslate,
    handleSystemVoiceInput,
    handleSubmit,
  } = input

  return (
    <div className="tm-input-footer">
      {!streaming && voiceHint ? (
        <span className="tm-input-voice-hint" role="status" title={voiceHint}>
          {voiceHint}
        </span>
      ) : null}
      <div className="tm-input-footer-actions">
        {streaming ? (
          <button type="button" className="tm-abort-btn" onClick={onAbort}>
            {t('chat.input.stopGenerating')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`tm-input-footer-btn ${translating ? 'tm-input-footer-btn--active' : ''}`}
              disabled={disabled || !text.trim() || !defaultModelId || translating}
              title={translating ? t('chat.input.translating') : t('chat.input.translate')}
              onClick={() => void handleTranslate()}
            >
              <IconTranslate size={18} className={translating ? 'tm-icon-spin' : undefined} />
            </button>
            <button
              type="button"
              className="tm-input-footer-btn"
              disabled={disabled}
              title={getSystemVoiceInputTitle()}
              onClick={handleSystemVoiceInput}
            >
              <IconMic size={18} />
            </button>
            <button
              type="button"
              className="tm-send-btn"
              disabled={disabled || !canSend}
              title={t('chat.input.send')}
              onClick={handleSubmit}
            >
              <IconSend />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
