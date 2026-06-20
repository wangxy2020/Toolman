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
import { SLASH_COMMANDS, type SlashCommandItem } from './slash-commands'
import { EmojiPickerPopup } from './EmojiPickerPopup'
import { useTranslate } from './useTranslate'
import { normalizeTranslationLanguages } from './translation-utils'
import type { SendShortcut } from './message-settings'
import {
  getSystemVoiceInputHint,
  getSystemVoiceInputTitle,
} from './system-voice-input'
import { getLocalFilePaths } from '../knowledge/knowledge-file-paths'

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
  onSend: (contentBlocks: ContentBlock[]) => void
  onAbort: () => void
  onError?: (message: string | null) => void
  toolbarMode?: 'agent' | 'group'
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

function sendShortcutPlaceholder(sendShortcut: SendShortcut): string {
  if (sendShortcut === 'ctrl+enter') return 'Ctrl + Enter 发送'
  if (sendShortcut === 'shift+enter') return 'Shift + Enter 发送'
  return 'Enter 发送'
}

function InputResizeHandle({ onResizeStart }: { onResizeStart: (startY: number) => void }) {
  return (
    <div
      className="tm-input-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调节输入框高度"
      title="拖动调节输入框高度"
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
  kbEnabled = true,
  spellCheckEnabled = true,
  sendShortcut = 'enter',
  onCreateSession,
  onClearSession,
  onToggleWebSearch,
  onToggleKb,
  prefillText,
  prefillAttachments,
  prefillRevision = 0,
  onSend,
  onAbort,
  onError,
  toolbarMode = 'agent',
}: Props) {
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

  const phraseMenuItems = useMemo<InputPopupMenuItemData[]>(
    () => [
      { id: 'add', command: '+ 添加快捷短语…', showIcon: false },
      ...quickPhrases.map((phrase) => ({
        id: phrase.id,
        command: phrase.label,
        description: phrase.text,
        showIcon: false,
      })),
    ],
    [quickPhrases],
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
      onError?.(error instanceof Error ? error.message : '翻译失败')
    }
  }

  const stagePathsAsAttachments = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return

      if (disabled) {
        onError?.('请先选择或创建话题并配置模型后再上传文件')
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
        onError?.(error instanceof Error ? error.message : '上传文件失败')
      }
    },
    [disabled, onError],
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
      onError?.(error instanceof Error ? error.message : '上传文件失败')
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
        setText('')
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
    [applyTextInsertion, onClearSession, onCreateSession, onToggleWebSearch, sendWithOptions, text],
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 1, SLASH_COMMANDS.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = SLASH_COMMANDS[slashActiveIndex]
        if (item) runSlashCommand(item)
      } else if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.min(index + 5, SLASH_COMMANDS.length - 1))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashActiveIndex((index) => Math.max(index - 5, 0))
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [runSlashCommand, slashActiveIndex, slashMenuOpen])

  useEffect(() => {
    if (!phraseMenuOpen || addingPhrase) return

    const onKeyDown = (event: KeyboardEvent) => {
      const maxIndex = phraseMenuItems.length - 1
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 1, maxIndex))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        handleSelectQuickPhrase(phraseActiveIndex)
      } else if (event.metaKey && event.key === 'ArrowDown') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.min(index + 5, maxIndex))
      } else if (event.metaKey && event.key === 'ArrowUp') {
        event.preventDefault()
        setPhraseActiveIndex((index) => Math.max(index - 5, 0))
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [addingPhrase, handleSelectQuickPhrase, phraseActiveIndex, phraseMenuItems.length, phraseMenuOpen])

  useEffect(() => {
    if (prefillText == null) return
    setText(prefillText)
    textareaRef.current?.focus()
  }, [prefillText])

  useEffect(() => {
    if (!prefillAttachments?.length) return
    setPendingAttachments(prefillAttachments)
    textareaRef.current?.focus()
  }, [prefillAttachments, prefillRevision])

  const placeholder = disabled
    ? toolbarMode === 'group'
      ? '只读成员无法发送消息'
      : '请先选择或创建话题'
    : modelCount > 1
      ? `在这里输入消息，将同时发送给 ${modelCount} 个模型`
      : toolbarMode === 'group'
        ? `在这里输入消息，按 ${sendShortcutPlaceholder(sendShortcut)}`
        : `在这里输入消息，按 ${sendShortcutPlaceholder(sendShortcut)} · @ 选择路径，/ 选择命令`

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
              title="新建话题"
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
                title="表情"
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
            title="上传文件"
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
                title={webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'}
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
                title={kbEnabled ? '关闭知识库检索' : '开启知识库检索'}
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
            title="斜杠命令"
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
            title="快捷短语"
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
            title="清空"
            onClick={() => setText('')}
          >
            <IconClear />
          </button>
          <InputResizeHandle onResizeStart={handleResizeStart} />
        </div>

        <InputPopupMenu
          title="斜杠命令"
          open={slashMenuOpen}
          onClose={() => setSlashMenuOpen(false)}
        >
          <InputPopupMenuList
            items={SLASH_COMMANDS.map((item) => ({
              id: item.id,
              command: item.command,
              description: item.description,
            }))}
            activeIndex={slashActiveIndex}
            onActiveIndexChange={setSlashActiveIndex}
            onSelect={(index) => {
              const item = SLASH_COMMANDS[index]
              if (item) runSlashCommand(item)
            }}
          />
        </InputPopupMenu>

        <InputPopupMenu
          title="快捷短语"
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
                placeholder="输入快捷短语内容"
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
                  取消
                </button>
                <button
                  type="button"
                  className="tm-input-popup-menu-form-btn tm-input-popup-menu-form-btn--primary"
                  disabled={!phraseDraft.trim()}
                  onClick={handleAddQuickPhrase}
                >
                  保存
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
                停止生成
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`tm-input-footer-btn ${translating ? 'tm-input-footer-btn--active' : ''}`}
                  disabled={disabled || !text.trim() || !defaultModelId || translating}
                  title={translating ? '翻译中…' : '翻译'}
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
                  title="发送"
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
