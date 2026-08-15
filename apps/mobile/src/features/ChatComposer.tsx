import { type ReactNode, useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
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
  IconGraduationCap,
  IconKnowledgeTool,
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
import { GROUP_CHAT_EMOJIS } from './group-chat-emojis'
import { GROUP_SLASH_COMMANDS } from './group-slash-commands'
import { useChatComposer, type ChatComposerProps } from './useChatComposer'
import { useComposerInputActions } from './useComposerInputActions'

export type { ChatComposerProps }

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
  classLive = false,
  onToggleClass,
  classToggleDisabled = false,
  onClear,
  onClearChat,
  onPopupOpenChange,
  popupDismissToken = 0,
  paddingLeft = DEFAULT_PAD_X,
  paddingRight = DEFAULT_PAD_X,
  onError,
}: ChatComposerProps) {
  const { t } = useI18n()
  const {
    fieldHeight,
    emojiOpen,
    slashOpen,
    phraseOpen,
    phrases,
    rootRef,
    canSend,
    isGroup,
    closePopups,
    trySend,
    insertEmoji,
    applySlashCommand,
    applyPhrase,
    toggleEmoji,
    toggleSlash,
    togglePhrase,
    resizePan,
  } = useChatComposer({
    value,
    onChangeText,
    onSend,
    busy,
    disabled,
    mode,
    onClearChat,
    onPopupOpenChange,
    popupDismissToken,
  })
  const inputActions = useComposerInputActions({
    value,
    onChangeText,
    disabled,
    busy,
    onError,
  })

  const iconColor = colors.text
  const activeColor = colors.accent
  const mutedColor = colors.textSecondary

  return (
    <View style={[styles.area, { paddingLeft, paddingRight }]} ref={rootRef} collapsable={false}>
      <View style={styles.box}>
        <View style={styles.toolbar}>
          {onToggleClass ? (
            <ToolBtn
              label={classLive ? '停止上课' : '上课'}
              active={classLive}
              onPress={onToggleClass}
              disabled={classToggleDisabled || busy}
            >
              <IconGraduationCap size={18} color={classLive ? activeColor : iconColor} />
            </ToolBtn>
          ) : null}
          {isGroup ? (
            <ToolBtn
              label="表情"
              active={emojiOpen}
              onPress={toggleEmoji}
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
            onPress={isGroup ? toggleSlash : undefined}
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
            onPress={togglePhrase}
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
                    onPress={() => applyPhrase(item.text)}
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
                <Pressable
                  style={[
                    styles.footerIcon,
                    inputActions.translating ? styles.footerIconActive : null,
                  ]}
                  disabled={!inputActions.canTranslate}
                  onPress={() => void inputActions.translateInput()}
                  accessibilityLabel={inputActions.translating ? '翻译中' : '翻译'}
                >
                  <Spinning spinning={inputActions.translating}>
                    <IconTranslate
                      size={18}
                      color={inputActions.canTranslate || inputActions.translating ? iconColor : mutedColor}
                    />
                  </Spinning>
                </Pressable>
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

function Spinning({ spinning, children }: { spinning: boolean; children: ReactNode }) {
  const rotate = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!spinning) {
      rotate.stopAnimation()
      rotate.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [rotate, spinning])
  return (
    <Animated.View
      style={{
        transform: [
          {
            rotate: rotate.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
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
  footerIconActive: {
    backgroundColor: colors.accentSoft,
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
