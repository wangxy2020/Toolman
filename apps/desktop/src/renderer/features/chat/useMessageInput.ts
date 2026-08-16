import { useCallback, useEffect, useRef, useState } from 'react'
import { addQuickPhrase, type QuickPhrase } from './quick-phrases'
import { useTranslate } from './useTranslate'
import { normalizeTranslationLanguages } from './translation-utils'
import type { MessageInputProps } from './message-input-types'
import { INPUT_MIN_HEIGHT } from './message-input-types'
import { buildMessageInputPlaceholder } from './message-input-utils'
import { useMessageInputAttachments } from './message-input-attachments'
import { useMessageInputSlashCommands } from './message-input-commands'
import { usePhraseMenuKeyboard, useSlashMenuKeyboard } from './message-input-menu-effects'
import { useMessageInputComposer } from './useMessageInputComposer'
import { useMessageInputInteractions } from './useMessageInputInteractions'
import { useMessageInputMenus } from './useMessageInputMenus'
import { useMessageInputPrefill } from './useMessageInputPrefill'
import { useI18n } from '../../i18n/useI18n'
import type { PendingAttachment } from './chat-attachments'

export function useMessageInput(props: MessageInputProps) {
  const {
    disabled,
    streaming,
    modelCount = 1,
    defaultModelId,
    defaultFilePath,
    translationLanguages,
    webSearchEnabled = false,
    kbEnabled = false,
    spellCheckEnabled = true,
    sendShortcut = 'enter',
    onCreateSession,
    onClearSession,
    onToggleWebSearch,
    onToggleKb,
    prefillText,
    prefillAttachments,
    prefillRevision = 0,
    onPrefillConsumed,
    onSend,
    onAbort,
    onError,
    toolbarMode = 'agent',
    groupIsOwner = false,
    loadQuickPhrasesFn,
    extraSlashCommands = [],
  } = props

  const { t } = useI18n()
  const [text, setText] = useState('')
  const [fieldHeight, setFieldHeight] = useState(INPUT_MIN_HEIGHT)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [phraseMenuOpen, setPhraseMenuOpen] = useState(false)
  const [emojiMenuOpen, setEmojiMenuOpen] = useState(false)
  const emojiAnchorRef = useRef<HTMLSpanElement>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [phraseActiveIndex, setPhraseActiveIndex] = useState(0)
  const [addingPhrase, setAddingPhrase] = useState(false)
  const [phraseDraft, setPhraseDraft] = useState('')
  const [quickPhrases, setQuickPhrases] = useState<QuickPhrase[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const { translate, translating } = useTranslate()
  const languages = normalizeTranslationLanguages(translationLanguages)

  const { slashCommands, localizedSlashCommands, phraseMenuItems } = useMessageInputMenus({
    toolbarMode,
    groupIsOwner,
    t,
    quickPhrases,
    setQuickPhrases,
    slashMenuOpen,
    phraseMenuOpen,
    setSlashActiveIndex,
    setPhraseActiveIndex,
    loadQuickPhrasesFn,
    extraSlashCommands,
    allowNewSession: Boolean(onCreateSession),
  })

  const { stagePathsAsAttachments, handleUploadFiles, handleInputPaste } = useMessageInputAttachments({
    disabled,
    defaultFilePath,
    onError,
    t,
    setPendingAttachments,
  })

  const { textareaRef, applyTextInsertion, handleResizeStart, createHandleSystemVoiceInput } =
    useMessageInputInteractions({ text, setText, fieldHeight, setFieldHeight })

  const handleSystemVoiceInput = useCallback(
    () => createHandleSystemVoiceInput(setVoiceHint)(),
    [createHandleSystemVoiceInput],
  )

  const {
    clearTimersRef,
    clearInput,
    sendWithOptions,
    canSend,
    handleTextChange,
    handleSubmit,
    handleInputDragOver,
    handleInputDrop,
  } = useMessageInputComposer({
    disabled,
    text,
    setText,
    pendingAttachments,
    setPendingAttachments,
    textareaRef,
    onSend,
    stagePathsAsAttachments,
  })

  useEffect(() => {
    return () => {
      for (const timer of clearTimersRef.current) clearTimeout(timer)
      clearTimersRef.current = []
    }
  }, [clearTimersRef])

  const handleTranslate = async () => {
    if (!text.trim() || !defaultModelId || disabled || translating) return
    onError?.(null)
    try {
      const result = await translate({ text, modelId: defaultModelId, translationLanguages: languages })
      setText(result.text)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t('chat.input.translateFailed'))
    }
  }

  const runSlashCommand = useMessageInputSlashCommands({
    text,
    setSlashMenuOpen,
    clearInput,
    onClearSession,
    onCreateSession,
    onToggleWebSearch,
    sendWithOptions,
    applyTextInsertion,
    setText,
  })

  const handleAddQuickPhrase = () => {
    const trimmed = phraseDraft.trim()
    if (!trimmed) return
    setQuickPhrases(addQuickPhrase(trimmed))
    setPhraseDraft('')
    setAddingPhrase(false)
  }

  const handleSelectQuickPhrase = useCallback(
    (index: number) => {
      if (index === 0) {
        setAddingPhrase(true)
        setPhraseActiveIndex(0)
        return
      }
      const phrase = quickPhrases[index - 1]
      if (!phrase) return
      setPhraseMenuOpen(false)
      applyTextInsertion(phrase.text)
    },
    [applyTextInsertion, quickPhrases],
  )

  useSlashMenuKeyboard({
    slashMenuOpen,
    slashCommandsLength: slashCommands.length,
    slashActiveIndex,
    setSlashActiveIndex,
    localizedSlashCommands,
    runSlashCommand,
  })

  usePhraseMenuKeyboard({
    phraseMenuOpen,
    addingPhrase,
    phraseMenuItemsLength: phraseMenuItems.length,
    phraseActiveIndex,
    setPhraseActiveIndex,
    handleSelectQuickPhrase,
  })

  useMessageInputPrefill({
    prefillText,
    prefillAttachments,
    prefillRevision,
    onPrefillConsumed,
    setText,
    setPendingAttachments,
    textareaRef,
  })

  const placeholder = buildMessageInputPlaceholder({
    disabled,
    toolbarMode,
    modelCount,
    sendShortcut,
    t,
  })

  return {
    t,
    disabled,
    streaming,
    webSearchEnabled,
    kbEnabled,
    spellCheckEnabled,
    sendShortcut,
    onCreateSession,
    onToggleWebSearch,
    onToggleKb,
    onAbort,
    toolbarMode,
    text,
    setText,
    handleTextChange,
    fieldHeight,
    slashMenuOpen,
    setSlashMenuOpen,
    phraseMenuOpen,
    setPhraseMenuOpen,
    emojiMenuOpen,
    setEmojiMenuOpen,
    emojiAnchorRef,
    slashActiveIndex,
    setSlashActiveIndex,
    phraseActiveIndex,
    setPhraseActiveIndex,
    addingPhrase,
    setAddingPhrase,
    phraseDraft,
    setPhraseDraft,
    pendingAttachments,
    setPendingAttachments,
    textareaRef,
    translating,
    voiceHint,
    localizedSlashCommands,
    phraseMenuItems,
    handleResizeStart,
    canSend,
    handleSubmit,
    handleTranslate,
    handleUploadFiles,
    handleInputDragOver,
    handleInputDrop,
    handleInputPaste,
    runSlashCommand,
    handleAddQuickPhrase,
    handleSelectQuickPhrase,
    applyTextInsertion,
    clearInput,
    handleSystemVoiceInput,
    placeholder,
  }
}
