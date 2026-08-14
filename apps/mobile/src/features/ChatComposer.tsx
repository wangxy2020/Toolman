import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  IconClear,
  IconEmoji,
  IconGlobe,
  IconKnowledgeTool,
  IconMic,
  IconNewTopic,
  IconPaperclip,
  IconResizeHandle,
  IconSend,
  IconShortcut,
  IconTerminalPrompt,
  IconTranslate,
} from '../icons/composer-icons'
import { colors } from '../theme'
import { useI18n } from '../i18n'
import { loadQuickPhrases, type QuickPhrase } from '../storage/quickPhrases'
import { GROUP_CHAT_EMOJIS } from './group-chat-emojis'
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

const DEFAULT_PAD_X = 12

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy = false,
  disabled = false,
  placeholder = '输入消息，Enter 发送…',
  mode = 'agent',
  webSearchEnabled = false,
  onToggleWebSearch,
  kbEnabled = false,
  onToggleKb,
  onNewTopic,
  onClear,
  onClearChat,
  onPopupOpenChange,
  popupDismissToken = 0,
  paddingLeft = DEFAULT_PAD_X,
  paddingRight = DEFAULT_PAD_X,
}: ChatComposerProps) {
  const [fieldHeight, setFieldHeight] = useState(FIELD_DEFAULT)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [phrases, setPhrases] = useState<QuickPhrase[]>([])
  const heightRef = useRef(FIELD_DEFAULT)
  const startYRef = useRef(0)
  const startHRef = useRef(FIELD_DEFAULT)
  const rootRef = useRef<View>(null)
  const canSend = Boolean(value.trim()) && !disabled && !busy
  const canSendRef = useRef(canSend)
  canSendRef.current = canSend
  const isGroup = mode === 'group'
  const { t } = useI18n()
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
        const next = Math.min(FIELD_MAX, Math.max(FIELD_MIN, startHRef.current + delta))
        heightRef.current = next
        setFieldHeight(next)
      },
    }),
  ).current

  const iconColor = colors.text
  const activeColor = colors.accent
  const mutedColor = colors.textSecondary

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

  return (
    <View style={[styles.area, { paddingLeft, paddingRight }]} ref={rootRef} collapsable={false}>
      <View style={styles.box}>
        <View style={styles.toolbar}>
          {isGroup ? (
            <ToolBtn
              label="表情"
              active={emojiOpen}
              onPress={() => {
                setSlashOpen(false)
                setPhraseOpen(false)
                setEmojiOpen((open) => !open)
              }}
              disabled={disabled || busy}
            >
              <IconEmoji size={18} color={emojiOpen ? activeColor : iconColor} />
            </ToolBtn>
          ) : onNewTopic ? (
            <ToolBtn label="新话题" onPress={onNewTopic} disabled={busy}>
              <IconNewTopic size={18} color={iconColor} />
            </ToolBtn>
          ) : null}
          <ToolBtn label="上传文件" disabled>
            <IconPaperclip size={18} color={iconColor} />
          </ToolBtn>
          {!isGroup ? (
            <>
              <ToolBtn
                label={webSearchEnabled ? '关闭联网' : '联网搜索'}
                active={webSearchEnabled}
                onPress={onToggleWebSearch}
                disabled={!onToggleWebSearch || busy}
              >
                <IconGlobe size={18} color={webSearchEnabled ? activeColor : iconColor} />
              </ToolBtn>
              <ToolBtn
                label={kbEnabled ? '关闭知识库' : '知识库'}
                active={kbEnabled}
                onPress={onToggleKb}
                disabled={!onToggleKb || busy}
              >
                <IconKnowledgeTool size={18} color={kbEnabled ? activeColor : iconColor} />
              </ToolBtn>
            </>
          ) : null}
          <ToolBtn
            label="斜杠命令"
            active={isGroup && slashOpen}
            onPress={
              isGroup
                ? () => {
                    setEmojiOpen(false)
                    setPhraseOpen(false)
                    setSlashOpen((open) => !open)
                  }
                : undefined
            }
            disabled={!isGroup || disabled || busy}
          >
            <IconTerminalPrompt
              size={18}
              color={isGroup && slashOpen ? activeColor : iconColor}
            />
          </ToolBtn>
          <ToolBtn
            label={t('chat.quickPhrases')}
            active={phraseOpen}
            onPress={() => {
              setEmojiOpen(false)
              setSlashOpen(false)
              setPhraseOpen((open) => !open)
            }}
            disabled={disabled || busy}
          >
            <IconShortcut size={18} color={phraseOpen ? activeColor : iconColor} />
          </ToolBtn>
          {!isGroup ? (
            <ToolBtn label="清空输入" onPress={onClear} disabled={!onClear || busy || !value}>
              <IconClear size={18} color={iconColor} />
            </ToolBtn>
          ) : null}

          <View
            style={styles.resizeHandle}
            accessibilityLabel="调整输入框高度"
            {...resizePan.panHandlers}
          >
            <IconResizeHandle size={12} color={mutedColor} />
          </View>
        </View>

        {isGroup && emojiOpen ? (
          <View style={styles.emojiPicker} accessibilityLabel="表情">
            <ScrollView
              style={styles.emojiScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.emojiGrid}>
                {GROUP_CHAT_EMOJIS.map((emoji, index) => (
                  <Pressable
                    key={`${emoji}-${index}`}
                    onPress={() => insertEmoji(emoji)}
                    style={({ pressed }) => [
                      styles.emojiItem,
                      pressed ? styles.emojiItemPressed : null,
                    ]}
                    accessibilityLabel={emoji}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {isGroup && slashOpen ? (
          <View style={styles.slashMenu} accessibilityLabel="斜杠命令">
            <ScrollView
              style={styles.slashBody}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {GROUP_SLASH_COMMANDS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => applySlashCommand(item)}
                  style={({ pressed }) => [
                    styles.slashRow,
                    pressed ? styles.slashRowActive : null,
                  ]}
                >
                  <View style={styles.slashRowLeft}>
                    <IconTerminalPrompt size={14} color={colors.text} />
                    <Text style={styles.slashCommand}>{item.command}</Text>
                  </View>
                  <Text style={styles.slashDesc} numberOfLines={1}>
                    {item.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.slashFooter}>
              <Text style={styles.slashFooterTitle}>斜杠命令</Text>
              <View style={styles.slashShortcuts}>
                <Text style={styles.slashKbd}>ESC 关闭</Text>
                <Text style={styles.slashKbd}>▲▼ 选择</Text>
                <Text style={styles.slashKbd}>↵ 确认</Text>
              </View>
            </View>
          </View>
        ) : null}

        {phraseOpen ? (
          <View style={styles.slashMenu} accessibilityLabel={t('chat.quickPhrases')}>
            <ScrollView
              style={styles.slashBody}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {phrases.length === 0 ? (
                <Text style={styles.slashDesc}>{t('quickPhrases.empty')}</Text>
              ) : (
                phrases.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      onChangeText(value ? `${value}${item.text}` : item.text)
                      setPhraseOpen(false)
                    }}
                    style={({ pressed }) => [
                      styles.slashRow,
                      pressed ? styles.slashRowActive : null,
                    ]}
                  >
                    <View style={styles.slashRowLeft}>
                      <IconShortcut size={14} color={colors.text} />
                      <Text style={styles.slashCommand} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </View>
                    <Text style={styles.slashDesc} numberOfLines={1}>
                      {item.text}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View style={styles.slashFooter}>
              <Text style={styles.slashFooterTitle}>{t('chat.quickPhrases')}</Text>
            </View>
          </View>
        ) : null}

        <TextInput
          style={[styles.field, { height: fieldHeight }]}
          value={value}
          onChangeText={onChangeText}
          onFocus={closePopups}
          placeholder={
            Platform.OS === 'web'
              ? isGroup
                ? '输入群组消息，Enter 发送，Shift+Enter 换行…'
                : '输入消息，Enter 发送，Shift+Enter 换行…'
              : placeholder
          }
          placeholderTextColor={colors.textSecondary}
          multiline
          editable={!disabled}
          blurOnSubmit={false}
          underlineColorAndroid="transparent"
          // @ts-expect-error react-native-web keyboard
          onKeyDown={(e: { key: string; shiftKey?: boolean; preventDefault: () => void }) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            e.preventDefault()
            trySend()
          }}
        />

        <View style={styles.footer}>
          <View style={{ flex: 1 }} />
          <View style={styles.footerActions}>
            {busy && !isGroup ? (
              <Pressable style={styles.abortBtn} onPress={onStop}>
                <Text style={styles.abortText}>停止</Text>
              </Pressable>
            ) : (
              <>
                {!isGroup ? (
                  <>
                    <Pressable style={styles.footerIcon} disabled accessibilityLabel="翻译">
                      <IconTranslate size={18} color={iconColor} />
                    </Pressable>
                    <Pressable style={styles.footerIcon} disabled accessibilityLabel="语音输入">
                      <IconMic size={18} color={iconColor} />
                    </Pressable>
                  </>
                ) : null}
                <Pressable
                  style={[styles.sendBtn, !canSend ? styles.sendBtnDisabled : null]}
                  disabled={!canSend}
                  onPress={trySend}
                  accessibilityLabel="发送"
                >
                  <IconSend size={18} color="#fff" />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

function ToolBtn(props: {
  children: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.tool,
        props.active ? styles.toolActive : null,
        props.disabled ? styles.toolDisabled : null,
      ]}
    >
      {props.children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  area: {
    paddingTop: 8,
    paddingBottom: 30,
    backgroundColor: colors.bg,
  },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
    paddingRight: 28,
  },
  tool: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolActive: {
    backgroundColor: colors.accentSoft,
  },
  toolDisabled: {
    opacity: 0.35,
  },
  emojiPicker: {
    marginHorizontal: 8,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  emojiScroll: {
    maxHeight: 168,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
  },
  emojiItem: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiItemPressed: {
    backgroundColor: colors.hover,
  },
  emojiText: {
    fontSize: 18,
    lineHeight: 22,
  },
  slashMenu: {
    marginHorizontal: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    // Soft elevation similar to desktop popup shadow.
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  slashBody: {
    maxHeight: 320,
  },
  slashRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  slashRowActive: {
    backgroundColor: colors.hover,
  },
  slashRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  slashCommand: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.text,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    }),
  },
  slashDesc: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  slashFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.hover,
  },
  slashFooterTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  slashShortcuts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
  },
  slashKbd: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  resizeHandle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    zIndex: 2,
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    textAlignVertical: 'top',
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  abortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  abortText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
})
