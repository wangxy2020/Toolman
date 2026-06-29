import {
  IconClear,
  IconEmoji,
  IconGlobe,
  IconKnowledge,
  IconNewTopic,
  IconPaperclip,
  IconShortcut,
  IconTerminalPrompt,
} from '../../components/icons'
import { EmojiPickerPopup } from './EmojiPickerPopup'
import { MessageInputResizeHandle } from './MessageInputResizeHandle'
import type { useMessageInput } from './useMessageInput'

type MessageInputState = ReturnType<typeof useMessageInput>

export function MessageInputToolbar({ input }: { input: MessageInputState }) {
  const {
    t,
    disabled,
    webSearchEnabled,
    kbEnabled,
    onCreateSession,
    onToggleWebSearch,
    onToggleKb,
    toolbarMode,
    text,
    emojiMenuOpen,
    setEmojiMenuOpen,
    emojiAnchorRef,
    slashMenuOpen,
    setSlashMenuOpen,
    phraseMenuOpen,
    setPhraseMenuOpen,
    setAddingPhrase,
    setPhraseDraft,
    handleUploadFiles,
    handleResizeStart,
    applyTextInsertion,
    clearInput,
  } = input

  return (
    <div className="tm-input-toolbar">
      {toolbarMode === 'agent' ? (
        <button
          type="button"
          className="tm-input-tool"
          disabled={!onCreateSession}
          title={t('chat.input.newTopic')}
          onClick={() => onCreateSession?.()}
        >
          <IconNewTopic />
        </button>
      ) : null}
      {toolbarMode === 'group' ? (
        <span className="tm-input-tool-anchor" ref={emojiAnchorRef}>
          <button
            type="button"
            className={[
              'tm-input-tool',
              emojiMenuOpen ? 'tm-input-tool--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={disabled}
            title={t('chat.input.emoji')}
            onClick={() => {
              setSlashMenuOpen(false)
              setPhraseMenuOpen(false)
              setEmojiMenuOpen((open) => !open)
            }}
          >
            <IconEmoji />
          </button>
          <EmojiPickerPopup
            open={emojiMenuOpen}
            anchorRef={emojiAnchorRef}
            onClose={() => setEmojiMenuOpen(false)}
            onSelect={(emoji) => applyTextInsertion(emoji)}
          />
        </span>
      ) : null}
      <button
        type="button"
        className="tm-input-tool"
        title={t('chat.input.uploadFile')}
        onClick={() => void handleUploadFiles()}
      >
        <IconPaperclip />
      </button>
      {toolbarMode === 'agent' ? (
        <>
          <button
            type="button"
            className={[
              'tm-input-tool',
              webSearchEnabled ? 'tm-input-tool--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={webSearchEnabled ? t('chat.input.webSearchOff') : t('chat.input.webSearchOn')}
            onClick={() => onToggleWebSearch?.()}
          >
            <IconGlobe />
          </button>
          <button
            type="button"
            className={[
              'tm-input-tool',
              kbEnabled ? 'tm-input-tool--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={kbEnabled ? t('chat.input.kbSearchOff') : t('chat.input.kbSearchOn')}
            onClick={() => onToggleKb?.()}
          >
            <IconKnowledge size={18} />
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={['tm-input-tool', slashMenuOpen ? 'tm-input-tool--active' : '']
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        title={t('chat.input.slashCommands')}
        onClick={() => {
          setPhraseMenuOpen(false)
          setSlashMenuOpen((open) => !open)
        }}
      >
        <IconTerminalPrompt />
      </button>
      <button
        type="button"
        className={['tm-input-tool', phraseMenuOpen ? 'tm-input-tool--active' : '']
          .filter(Boolean)
          .join(' ')}
        disabled={disabled}
        title={t('chat.input.quickPhrases')}
        onClick={() => {
          setSlashMenuOpen(false)
          setPhraseMenuOpen((open) => {
            const next = !open
            if (!next) {
              setAddingPhrase(false)
              setPhraseDraft('')
            }
            return next
          })
        }}
      >
        <IconShortcut />
      </button>
      <button
        type="button"
        className="tm-input-tool"
        disabled={disabled || !text.trim()}
        title={t('chat.input.clear')}
        onClick={clearInput}
      >
        <IconClear />
      </button>
      <MessageInputResizeHandle onResizeStart={handleResizeStart} />
    </div>
  )
}
