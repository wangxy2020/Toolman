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
import { InputToolButton } from './InputToolButton'
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
        <InputToolButton
          label={onCreateSession ? t('chat.input.newTopic') : t('chat.input.newTopicDisabled')}
          disabled={!onCreateSession}
          onClick={() => onCreateSession?.()}
        >
          <IconNewTopic />
        </InputToolButton>
      ) : null}
      {toolbarMode === 'group' ? (
        <span className="tm-input-tool-anchor" ref={emojiAnchorRef}>
          <InputToolButton
            label={t('chat.input.emoji')}
            active={emojiMenuOpen}
            disabled={disabled}
            onClick={() => {
              setSlashMenuOpen(false)
              setPhraseMenuOpen(false)
              setEmojiMenuOpen((open) => !open)
            }}
          >
            <IconEmoji />
          </InputToolButton>
          <EmojiPickerPopup
            open={emojiMenuOpen}
            anchorRef={emojiAnchorRef}
            onClose={() => setEmojiMenuOpen(false)}
            onSelect={(emoji) => applyTextInsertion(emoji)}
          />
        </span>
      ) : null}
      <InputToolButton
        label={t('chat.input.uploadFile')}
        onClick={() => void handleUploadFiles()}
      >
        <IconPaperclip />
      </InputToolButton>
      {toolbarMode === 'agent' ? (
        <>
          <InputToolButton
            label={webSearchEnabled ? t('chat.input.webSearchOff') : t('chat.input.webSearchOn')}
            active={webSearchEnabled}
            onClick={() => onToggleWebSearch?.()}
          >
            <IconGlobe />
          </InputToolButton>
          <InputToolButton
            label={kbEnabled ? t('chat.input.kbSearchOff') : t('chat.input.kbSearchOn')}
            active={kbEnabled}
            onClick={() => onToggleKb?.()}
          >
            <IconKnowledge size={18} />
          </InputToolButton>
        </>
      ) : null}
      <InputToolButton
        label={t('chat.input.slashCommands')}
        active={slashMenuOpen}
        disabled={disabled}
        onClick={() => {
          setPhraseMenuOpen(false)
          setSlashMenuOpen((open) => !open)
        }}
      >
        <IconTerminalPrompt />
      </InputToolButton>
      <InputToolButton
        label={t('chat.input.quickPhrases')}
        active={phraseMenuOpen}
        disabled={disabled}
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
      </InputToolButton>
      <InputToolButton
        label={t('chat.input.clear')}
        disabled={disabled || !text.trim()}
        onClick={clearInput}
      >
        <IconClear />
      </InputToolButton>
      <MessageInputResizeHandle onResizeStart={handleResizeStart} />
    </div>
  )
}
