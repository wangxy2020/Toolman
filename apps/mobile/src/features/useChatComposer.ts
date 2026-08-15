import { useEffect, useRef, useState } from 'react'
import { PanResponder, Platform } from 'react-native'
import { loadQuickPhrases, type QuickPhrase } from '../storage/quickPhrases'
import { GROUP_SLASH_COMMANDS } from './group-slash-commands'

const FIELD_MIN = 56
const FIELD_MAX = 200
const FIELD_DEFAULT = 72

export type ChatComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  onStop?: () => void
  busy?: boolean
  disabled?: boolean
  placeholder?: string
  /** `agent` (default) shows agent tools; `group` is member chat (no LLM tools). */
  mode?: 'agent' | 'group'
  webSearchEnabled?: boolean
  onToggleWebSearch?: () => void
  kbEnabled?: boolean
  onToggleKb?: () => void
  useDesktopHost?: boolean
  onToggleDesktopHost?: () => void
  onNewTopic?: () => void
  classLive?: boolean
  onToggleClass?: () => void
  classToggleDisabled?: boolean
  onClear?: () => void
  /** Clear own messages on this page (group `/clear`). */
  onClearChat?: () => void
  /** Fired when emoji / slash popup open state changes (for outside-dismiss overlays). */
  onPopupOpenChange?: (open: boolean) => void
  /** Increment to force-close open popups (outside tap from parent). */
  popupDismissToken?: number
  /** Outer horizontal padding; defaults match stream / desktop gutter. */
  paddingLeft?: number
  paddingRight?: number
}

export function clampComposerFieldHeight(value: number): number {
  return Math.min(FIELD_MAX, Math.max(FIELD_MIN, value))
}

export function useChatComposer(props: {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  busy: boolean
  disabled: boolean
  mode: 'agent' | 'group'
  onClearChat?: () => void
  onPopupOpenChange?: (open: boolean) => void
  popupDismissToken: number
}) {
  const {
    value,
    onChangeText,
    onSend,
    busy,
    disabled,
    mode,
    onClearChat,
    onPopupOpenChange,
    popupDismissToken,
  } = props
  const [fieldHeight, setFieldHeight] = useState(FIELD_DEFAULT)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [phrases, setPhrases] = useState<QuickPhrase[]>([])
  const heightRef = useRef(FIELD_DEFAULT)
  const startYRef = useRef(0)
  const startHRef = useRef(FIELD_DEFAULT)
  const rootRef = useRef<import('react-native').View>(null)
  const canSend = Boolean(value.trim()) && !disabled && !busy
  const canSendRef = useRef(canSend)
  canSendRef.current = canSend
  const isGroup = mode === 'group'
  const popupOpen = emojiOpen || slashOpen || phraseOpen

  const closePopups = () => {
    setEmojiOpen(false)
    setSlashOpen(false)
    setPhraseOpen(false)
  }

  useEffect(() => {
    if (!phraseOpen) return
    void loadQuickPhrases().then(setPhrases)
  }, [phraseOpen])

  useEffect(() => {
    onPopupOpenChange?.(popupOpen)
  }, [onPopupOpenChange, popupOpen])

  // Only dismiss-token changes should close popups; closePopups is stable here.
  useEffect(() => {
    if (popupDismissToken > 0) closePopups()
  }, [popupDismissToken])

  useEffect(() => {
    if (!popupOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopups()
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onPointerDown = (event: PointerEvent) => {
        const node = rootRef.current as unknown as { contains?: (n: Node) => boolean } | null
        const target = event.target as Node
        if (node?.contains?.(target)) return
        closePopups()
      }
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('keydown', onKeyDown)
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }
    return undefined
  }, [popupOpen])

  const resizePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        startYRef.current = e.nativeEvent.pageY
        startHRef.current = heightRef.current
      },
      onPanResponderMove: (e) => {
        const delta = startYRef.current - e.nativeEvent.pageY
        const next = clampComposerFieldHeight(startHRef.current + delta)
        heightRef.current = next
        setFieldHeight(next)
      },
    }),
  ).current

  const trySend = () => {
    if (!canSendRef.current) return
    onSend()
  }

  const insertEmoji = (emoji: string) => {
    onChangeText(`${value}${emoji}`)
    setEmojiOpen(false)
  }

  const applySlashCommand = (command: (typeof GROUP_SLASH_COMMANDS)[number]) => {
    setSlashOpen(false)
    if (command.action === 'clear') {
      onClearChat?.()
      return
    }
    if (command.insert) {
      onChangeText(command.insert)
    }
  }

  const toggleEmoji = () => {
    setSlashOpen(false)
    setPhraseOpen(false)
    setEmojiOpen((open) => !open)
  }

  const toggleSlash = () => {
    setEmojiOpen(false)
    setPhraseOpen(false)
    setSlashOpen((open) => !open)
  }

  const togglePhrase = () => {
    setEmojiOpen(false)
    setSlashOpen(false)
    setPhraseOpen((open) => !open)
  }

  const applyPhrase = (text: string) => {
    onChangeText(value ? `${value}${text}` : text)
    setPhraseOpen(false)
  }

  return {
    fieldHeight,
    emojiOpen,
    slashOpen,
    phraseOpen,
    phrases,
    rootRef,
    canSend,
    isGroup,
    popupOpen,
    closePopups,
    trySend,
    insertEmoji,
    applySlashCommand,
    applyPhrase,
    toggleEmoji,
    toggleSlash,
    togglePhrase,
    resizePan,
  }
}
