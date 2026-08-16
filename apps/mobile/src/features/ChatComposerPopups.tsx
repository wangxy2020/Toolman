import { type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import {
  IconClear,
  IconEmoji,
  IconGlobe,
  IconGraduationCap,
  IconKnowledgeTool,
  IconNewTopic,
  IconPaperclip,
  IconResizeHandle,
  IconShortcut,
  IconTerminalPrompt,
} from '../icons/composer-icons'
import { colors } from '../theme'
import { GROUP_CHAT_EMOJIS } from './group-chat-emojis'
import { GROUP_SLASH_COMMANDS } from './group-slash-commands'
import { chatComposerStyles as styles } from './chatComposerStyles'

export function ComposerToolBtn(props: {
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

export function ChatComposerToolbar(props: {
  isGroup: boolean
  busy: boolean
  disabled: boolean
  classLive: boolean
  classToggleDisabled: boolean
  onToggleClass?: () => void
  onNewTopic?: () => void
  onAttachFile?: () => void
  webSearchEnabled: boolean
  onToggleWebSearch?: () => void
  kbEnabled: boolean
  onToggleKb?: () => void
  emojiOpen: boolean
  slashOpen: boolean
  phraseOpen: boolean
  phraseLabel: string
  onToggleEmoji: () => void
  onToggleSlash: () => void
  onTogglePhrase: () => void
  onClear?: () => void
  value: string
  resizePanHandlers: object
}) {
  const iconColor = colors.text
  const activeColor = colors.accent
  const mutedColor = colors.textSecondary
  return (
    <View style={styles.toolbar}>
      {props.onToggleClass ? (
        <ComposerToolBtn
          label={props.classLive ? '停止上课' : '上课'}
          active={props.classLive}
          onPress={props.onToggleClass}
          disabled={props.classToggleDisabled || props.busy}
        >
          <IconGraduationCap size={18} color={props.classLive ? activeColor : iconColor} />
        </ComposerToolBtn>
      ) : null}
      {props.isGroup ? (
        <ComposerToolBtn
          label="表情"
          active={props.emojiOpen}
          onPress={props.onToggleEmoji}
          disabled={props.disabled || props.busy}
        >
          <IconEmoji size={18} color={props.emojiOpen ? activeColor : iconColor} />
        </ComposerToolBtn>
      ) : props.onNewTopic ? (
        <ComposerToolBtn label="新话题" onPress={props.onNewTopic} disabled={props.busy}>
          <IconNewTopic size={18} color={iconColor} />
        </ComposerToolBtn>
      ) : null}
      <ComposerToolBtn
        label="上传文件"
        onPress={props.onAttachFile}
        disabled={!props.onAttachFile || props.disabled || props.busy}
      >
        <IconPaperclip size={18} color={iconColor} />
      </ComposerToolBtn>
      {!props.isGroup ? (
        <>
          <ComposerToolBtn
            label={props.webSearchEnabled ? '关闭联网' : '联网搜索'}
            active={props.webSearchEnabled}
            onPress={props.onToggleWebSearch}
            disabled={!props.onToggleWebSearch || props.busy}
          >
            <IconGlobe size={18} color={props.webSearchEnabled ? activeColor : iconColor} />
          </ComposerToolBtn>
          <ComposerToolBtn
            label={props.kbEnabled ? '关闭知识库' : '知识库'}
            active={props.kbEnabled}
            onPress={props.onToggleKb}
            disabled={!props.onToggleKb || props.busy}
          >
            <IconKnowledgeTool size={18} color={props.kbEnabled ? activeColor : iconColor} />
          </ComposerToolBtn>
        </>
      ) : null}
      <ComposerToolBtn
        label="斜杠命令"
        active={props.isGroup && props.slashOpen}
        onPress={props.isGroup ? props.onToggleSlash : undefined}
        disabled={!props.isGroup || props.disabled || props.busy}
      >
        <IconTerminalPrompt
          size={18}
          color={props.isGroup && props.slashOpen ? activeColor : iconColor}
        />
      </ComposerToolBtn>
      <ComposerToolBtn
        label={props.phraseLabel}
        active={props.phraseOpen}
        onPress={props.onTogglePhrase}
        disabled={props.disabled || props.busy}
      >
        <IconShortcut size={18} color={props.phraseOpen ? activeColor : iconColor} />
      </ComposerToolBtn>
      {!props.isGroup ? (
        <ComposerToolBtn
          label="清空输入"
          onPress={props.onClear}
          disabled={!props.onClear || props.busy || !props.value}
        >
          <IconClear size={18} color={colors.text} />
        </ComposerToolBtn>
      ) : null}

      <View
        style={styles.resizeHandle}
        accessibilityLabel="调整输入框高度"
        {...props.resizePanHandlers}
      >
        <IconResizeHandle size={12} color={mutedColor} />
      </View>
    </View>
  )
}

export function ChatComposerEmojiPicker(props: { onInsert: (emoji: string) => void }) {
  return (
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
              onPress={() => props.onInsert(emoji)}
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
  )
}

export function ChatComposerSlashMenu(props: {
  onApply: (item: (typeof GROUP_SLASH_COMMANDS)[number]) => void
}) {
  return (
    <View style={styles.slashMenu} accessibilityLabel="斜杠命令">
      <ScrollView
        style={styles.slashBody}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {GROUP_SLASH_COMMANDS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => props.onApply(item)}
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
  )
}

export function ChatComposerPhraseMenu(props: {
  label: string
  emptyLabel: string
  phrases: Array<{ id: string; label: string; text: string }>
  onApply: (text: string) => void
}) {
  return (
    <View style={styles.slashMenu} accessibilityLabel={props.label}>
      <ScrollView
        style={styles.slashBody}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {props.phrases.length === 0 ? (
          <Text style={styles.slashDesc}>{props.emptyLabel}</Text>
        ) : (
          props.phrases.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => props.onApply(item.text)}
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
        <Text style={styles.slashFooterTitle}>{props.label}</Text>
      </View>
    </View>
  )
}
