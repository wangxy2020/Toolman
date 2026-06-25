import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { IpcChannel, type ContentBlock, type TranslationLanguage } from '@toolman/shared'
import {
  IconClear,
  IconEmoji,
  IconGlobe,
  IconKnowledge,
  IconMic,
  IconNewTopic,
  IconPaperclip,
  IconSend,
  IconShortcut,
  IconTerminalPrompt,
  IconTranslate,
} from '../../components/icons'
import {
  pendingAttachmentsToContentBlocks,
  type PendingAttachment,
} from './chat-attachments'
import { MessageAttachmentChip } from './MessageAttachmentChip'
import {
  InputPopupMenu,
  InputPopupMenuList,
  type InputPopupMenuItemData,
} from './InputPopupMenu'
import { addQuickPhrase, loadQuickPhrases, type QuickPhrase } from './quick-phrases'
import { getGroupSlashCommands, SLASH_COMMANDS, type SlashCommandItem } from './slash-commands'
import { EmojiPickerPopup } from './EmojiPickerPopup'
import { useTranslate } from './useTranslate'
import { normalizeTranslationLanguages } from './translation-utils'
import type { SendShortcut } from './message-settings'
import {
  getSystemVoiceInputHint,
  getSystemVoiceInputTitle,
} from './system-voice-input'
import { getLocalFilePaths } from '../knowledge/knowledge-file-paths'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  disabled: boolean
  streaming: boolean
  modelCount?: number
  defaultModelId: string | null
  defaultFilePath?: string | null
  translationLanguages?: [TranslationLanguage, TranslationLanguage]
  webSearchEnabled?: boolean
  kbEnabled?: boolean
  spellCheckEnabled?: boolean
  sendShortcut?: SendShortcut
  onCreateSession?: () => void
  onClearSession?: () => void
  onToggleWebSearch?: () => void
  onToggleKb?: () => void
  prefillText?: string | null
  prefillAttachments?: PendingAttachment[] | null
  prefillRevision?: number
  onPrefillConsumed?: () => void
  onSend: (contentBlocks: ContentBlock[]) => void
  onAbort: () => void
  onError?: (message: string | null) => void
  toolbarMode?: 'agent' | 'group'
  groupIsOwner?: boolean
}

const INPUT_MIN_HEIGHT = 66
const INPUT_MAX_HEIGHT = 200

function shouldSubmitOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  sendShortcut: SendShortcut,
): boolean {
  const enter = event.key === 'Enter'
  const shift = event.shiftKey
  const ctrl = event.metaKey || event.ctrlKey

  if (sendShortcut === 'enter') {
    return enter && !shift
  }
  if (sendShortcut === 'ctrl+enter') {
    return enter && ctrl
  }
  return enter && shift
}

function sendShortcutPlaceholder(sendShortcut: SendShortcut, t: (key: string) => string): string {
  if (sendShortcut === 'ctrl+enter') return t('chat.input.sendCtrlEnter')
  if (sendShortcut === 'shift+enter') return t('chat.input.sendShiftEnter')
  return t('chat.input.sendEnter')
}

function InputResizeHandle({ onResizeStart }: { onResizeStart: (startY: number) => void }) {
  const { t } = useI18n()
  return (
    <div
      className="tm-input-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('chat.input.resizeHandle')}
      title={t('chat.input.resizeHandleTitle')}
      onPointerDown={(e) => {
        e.preventDefault()
        onResizeStart(e.clientY)
      }}
    >
      <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M4 0L10 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M7 0L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  currentText: string,
  insertion: string,
): { nextText: string; cursor: number } {
  const start = textarea.selectionStart ?? currentText.length
  const end = textarea.selectionEnd ?? currentText.length
  const nextText = currentText.slice(0, start) + insertion + currentText.slice(end)
  return { nextText, cursor: start + insertion.length }
}

export function MessageInput({
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
}: Props) {
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
  const fieldHeightRef = useRef(fieldHeight)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voiceHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  fieldHeightRef.current = fieldHeight
  const { translate, translating } = useTranslate()
  const languages = normalizeTranslationLanguages(translationLanguages)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)

  const slashCommands = useMemo(
    () => (toolbarMode === 'group' ? getGroupSlashCommands(groupIsOwner) : SLASH_COMMANDS),
    [groupIsOwner, toolbarMode],
  )
  const localizedSlashCommands = useMemo(
    () =>
      slashCommands.map((item) => ({
        ...item,
        description: t(
          `chat.slashCommands.${
            item.id === 'new'
              ? 'newSession'
              : item.id === 'clear' && toolbarMode === 'group'
                ? 'clearGroup'
                : item.id
          }`,
        ),
      })),
    [slashCommands, t, toolbarMode],
  )

  const phraseMenuItems = useMemo<InputPopupMenuItemData[]>(
    () => [
      { id: 'add', command: t('chat.input.addQuickPhrase'), showIcon: false },
      ...quickPhrases.map((phrase) => ({
        id: phrase.id,
        command: phrase.label,
        description: phrase.text,
        showIcon: false,
      })),
    ],
    [quickPhrases, t],
  )

  useEffect(() => {
    setQuickPhrases(loadQuickPhrases())
  }, [])

  useEffect(() => {
    return () => {
      if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (slashMenuOpen) setSlashActiveIndex(0)
  }, [slashMenuOpen])

  useEffect(() => {
    if (phraseMenuOpen) setPhraseActiveIndex(0)
  }, [phraseMenuOpen])

  const focusTextarea = useCallback((cursor?: number) => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    if (cursor != null) {
      textarea.setSelectionRange(cursor, cursor)
    }
  }, [])

  const handleSystemVoiceInput = useCallback(() => {
    focusTextarea(text.length)
    const hint = getSystemVoiceInputHint()
    setVoiceHint(hint)
    if (voiceHintTimerRef.current) clearTimeout(voiceHintTimerRef.current)
    voiceHintTimerRef.current = setTimeout(() => setVoiceHint(null), 8000)
  }, [focusTextarea, text.length])

  const applyTextInsertion = useCallback(
    (insertion: string) => {
      const textarea = textareaRef.current
      if (!textarea) {
        setText((prev) => (prev ? `${prev} ${insertion}` : insertion))
        return
      }

      const { nextText, cursor } = insertAtCursor(textarea, text, insertion)
      setText(nextText)
      requestAnimationFrame(() => focusTextarea(cursor))
    },
    [focusTextarea, text],
  )

  const clearInput = useCallback(() => {
    setText('')
    setPendingAttachments([])
  }, [])

  const sendWithOptions = useCallback(
    (contentBlocks: ContentBlock[]) => {
      onSend(contentBlocks)
    },
    [onSend],
  )

  const handleResizeStart = useCallback((startY: number) => {
    const startHeight = fieldHeightRef.current

    const onPointerMove = (event: PointerEvent) => {
      const deltaY = event.clientY - startY
      const nextHeight = Math.min(
        INPUT_MAX_HEIGHT,
        Math.max(INPUT_MIN_HEIGHT, startHeight - deltaY),
      )
      setFieldHeight(nextHeight)
    }

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }, [])

  const canSend = Boolean(text.trim() || pendingAttachments.length > 0)

  const handleSubmit = () => {
    if (!canSend || disabled) return
    const contentBlocks = pendingAttachmentsToContentBlocks(pendingAttachments, text)
    sendWithOptions(contentBlocks)
    setText('')
    setPendingAttachments([])
  }

  const handleTranslate = async () => {
    if (!text.trim() || !defaultModelId || disabled || translating) return

    onError?.(null)
    try {
      const result = await translate({
        text,
        modelId: defaultModelId,
        translationLanguages: languages,
      })
      setText(result.text)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t('chat.input.translateFailed'))
    }
  }

  const stagePathsAsAttachments = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return

      if (disabled) {
        onError?.(t('chat.input.uploadNeedSession'))
        return
      }

      onError?.(null)
      try {
        const stageResult = await window.api.invoke(IpcChannel.ChatStageAttachments, { paths })
        if (!stageResult.ok) {
          onError?.(stageResult.error.message)
          return
        }

        const staged = stageResult.data as {
          items: Array<{
            path: string
            name: string
            blobHash: string
            mimeType: string
            kind: 'file' | 'image'
          }>
          errors?: Array<{ path: string; message: string }>
        }

        if (staged.errors?.length) {
          onError?.(
            staged.errors
              .map((item) => `${item.path.split(/[/\\]/).pop() ?? item.path}：${item.message}`)
              .join('\n'),
          )
        }
        if (staged.items.length === 0) return

        setPendingAttachments((prev) => {
          const next = [...prev]
          const existingPaths = new Set(prev.map((item) => item.path))

          for (const item of staged.items) {
            if (existingPaths.has(item.path)) continue
            existingPaths.add(item.path)
            next.push({
              path: item.path,
              name: item.name,
              blobHash: item.blobHash,
              mimeType: item.mimeType,
              kind: item.kind,
            })
          }

          return next
        })
      } catch (error) {
        onError?.(error instanceof Error ? error.message : t('chat.input.uploadFailed'))
      }
    },
    [disabled, onError, t],
  )

  const handleUploadFiles = async () => {
    onError?.(null)
    try {
      const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
        multiple: true,
        defaultPath: defaultFilePath ?? undefined,
      })
      if (!pickResult.ok) {
        onError?.(pickResult.error.message)
        return
      }

      const { paths } = pickResult.data as { paths: string[] }
      await stagePathsAsAttachments(paths)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t('chat.input.uploadFailed'))
    }
  }

  const handleInputDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleInputDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      const paths = getLocalFilePaths(event.dataTransfer.files, event.dataTransfer)
      void stagePathsAsAttachments(paths)
    },
    [stagePathsAsAttachments],
  )

  const runSlashCommand = useCallback(
    (item: SlashCommandItem) => {
      setSlashMenuOpen(false)

      if (item.action === 'clear') {
        clearInput()
        onClearSession?.()
        return
      }
      if (item.action === 'new-session') {
        onCreateSession?.()
        return
      }
      if (item.action === 'toggle-web-search') {
        onToggleWebSearch?.()
        return
      }
      if (item.insert) {
        if (item.insert.endsWith('。') && !text.trim()) {
          sendWithOptions([{ type: 'text', text: item.insert }])
          setText('')
        } else {
          applyTextInsertion(item.insert)
        }
      }
    },
    [applyTextInsertion, clearInput, onClearSession, onCreateSession, onToggleWebSearch, sendWithOptions, text],
  )

  const handleAddQuickPhrase = () => {
    const trimmed = phraseDraft.trim()
    if (!trimmed) return
    const next = addQuickPhrase(trimmed)
    setQuickPhrases(next)
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

  useEffect(() => {
    if (!slashMenuOpen) return

    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 5, slashCommands.length - 1))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 1, slashCommands.length - 1))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 5, 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = localizedSlashCommands[slashActiveIndex]
        if (item) runSlashCommand(item)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [localizedSlashCommands, runSlashCommand, slashActiveIndex, slashMenuOpen])

  useEffect(() => {
    if (!phraseMenuOpen || addingPhrase) return

    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      const maxIndex = phraseMenuItems.length - 1
      if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 5, maxIndex))
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 1, maxIndex))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 5, 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        handleSelectQuickPhrase(phraseActiveIndex)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [addingPhrase, handleSelectQuickPhrase, phraseActiveIndex, phraseMenuItems.length, phraseMenuOpen])

  useEffect(() => {
    if (prefillRevision <= 0) return
    if (prefillText == null && !prefillAttachments?.length) return

    if (prefillText != null) {
      setText(prefillText)
    }
    if (prefillAttachments?.length) {
      setPendingAttachments(prefillAttachments)
    }
    textareaRef.current?.focus()
    onPrefillConsumed?.()
  }, [prefillAttachments, prefillRevision, prefillText, onPrefillConsumed])

  const placeholder = disabled
    ? toolbarMode === 'group'
      ? t('chat.input.placeholderGroupReadonly')
      : t('chat.input.placeholderNoSession')
    : modelCount > 1
      ? t('chat.input.placeholderMultiModel', { count: modelCount })
      : toolbarMode === 'group'
        ? t('chat.input.placeholderGroup', { shortcut: sendShortcutPlaceholder(sendShortcut, t) })
        : t('chat.input.placeholderAgent', { shortcut: sendShortcutPlaceholder(sendShortcut, t) })

  return (
    <div className="tm-input-area">
      <div
        className="tm-input-box"
        onDragOver={handleInputDragOver}
        onDrop={handleInputDrop}
      >
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
          <InputResizeHandle onResizeStart={handleResizeStart} />
        </div>

        <InputPopupMenu
          title={t('chat.input.slashCommands')}
          open={slashMenuOpen}
          onClose={() => setSlashMenuOpen(false)}
        >
          <InputPopupMenuList
            items={localizedSlashCommands.map((item) => ({
              id: item.id,
              command: item.command,
              description: item.description,
            }))}
            activeIndex={slashActiveIndex}
            onActiveIndexChange={setSlashActiveIndex}
            onSelect={(index) => {
              const item = localizedSlashCommands[index]
              if (item) runSlashCommand(item)
            }}
          />
        </InputPopupMenu>

        <InputPopupMenu
          title={t('chat.input.quickPhrases')}
          open={phraseMenuOpen}
          onClose={() => {
            setPhraseMenuOpen(false)
            setAddingPhrase(false)
            setPhraseDraft('')
          }}
        >
          {addingPhrase ? (
            <div className="tm-input-popup-menu-form">
              <input
                className="tm-input-popup-menu-input"
                value={phraseDraft}
                placeholder={t('chat.input.quickPhrasePlaceholder')}
                autoFocus
                onChange={(e) => setPhraseDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddQuickPhrase()
                  }
                }}
              />
              <div className="tm-input-popup-menu-form-actions">
                <button
                  type="button"
                  className="tm-input-popup-menu-form-btn"
                  onClick={() => {
                    setAddingPhrase(false)
                    setPhraseDraft('')
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="tm-input-popup-menu-form-btn tm-input-popup-menu-form-btn--primary"
                  disabled={!phraseDraft.trim()}
                  onClick={handleAddQuickPhrase}
                >
                  {t('chat.input.save')}
                </button>
              </div>
            </div>
          ) : (
            <InputPopupMenuList
              items={phraseMenuItems}
              activeIndex={phraseActiveIndex}
              onActiveIndexChange={setPhraseActiveIndex}
              onSelect={handleSelectQuickPhrase}
            />
          )}
        </InputPopupMenu>

        {pendingAttachments.length > 0 ? (
          <div className="tm-input-attachments">
            {pendingAttachments.map((attachment) => (
              <MessageAttachmentChip
                key={attachment.path}
                name={attachment.name}
                onRemove={() =>
                  setPendingAttachments((prev) =>
                    prev.filter((item) => item.path !== attachment.path),
                  )
                }
              />
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="tm-input-field"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          spellCheck={spellCheckEnabled}
          style={{ height: fieldHeight }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (shouldSubmitOnEnter(e, sendShortcut)) {
              e.preventDefault()
              if (!streaming) handleSubmit()
            }
          }}
        />

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
      </div>
    </div>
  )
}
