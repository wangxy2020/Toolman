import { type ReactNode } from 'react'
import type { ChatMessage } from '../state/MobileAppContext'
import { Pressable, Text, View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { stripSocraticMachineBlocks } from '@toolman/shared'
import {
  IconCopy,
  IconGitFork,
  IconPause,
  IconPlay,
  IconRefresh,
  IconSaveNote,
  IconSpeaker,
  IconStop,
  IconTranslate,
  IconTrashMsg,
} from '../icons/composer-icons'
import { colors } from '../theme'
import { getMobileTtsController } from '../voice'
import { formatMessageTime, streamAvatarInitial } from './agentPaneUtils'
import { agentStreamStyles as styles } from './agentStreamStyles'
import { SpinningIcon } from './SpinningIcon'
import { MessageMarkdown } from './MessageMarkdown'
import { StreamCursor } from './StreamCursor'
import { ThinkingHeartbeat } from './ThinkingHeartbeat'
import { useAgentRightPane } from './useAgentRightPane'

export function AgentStreamMessage(props: {
  msg: ChatMessage
  pane: ReturnType<typeof useAgentRightPane>
}) {
  const { msg, pane } = props
  const isUser = msg.role === 'user'
  const displayName = isUser ? pane.userDisplayName : pane.assistantName
  const avatarLabel = isUser ? streamAvatarInitial(displayName, '用') : 'A'
  const streamingThis =
    pane.busy &&
    msg.role === 'assistant' &&
    msg.id === pane.session!.messages[pane.session!.messages.length - 1]?.id
  const translation = pane.translations[msg.id]
  const showTranslation = Boolean(translation && pane.visibleTranslationIds[msg.id])
  const checked = pane.selectedIds.has(msg.id)

  return (
    <View style={styles.msgBlock}>
      <View style={styles.msgHead}>
        <View
          style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarAssistant]}
          accessibilityLabel={displayName}
        >
          <Text style={[styles.avatarText, isUser ? styles.avatarTextUser : styles.avatarTextAssistant]}>
            {avatarLabel}
          </Text>
        </View>
        <View style={styles.msgMeta}>
          <Text style={styles.msgName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.msgTime}>{formatMessageTime(msg.createdAt)}</Text>
        </View>
      </View>
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {pane.selectionMode ? (
          <Pressable
            accessibilityLabel="选择消息"
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => pane.toggleMessageSelected(msg.id)}
            style={styles.selectHit}
          >
            <View style={[styles.selectBox, checked ? styles.selectBoxChecked : null]}>
              {checked ? <IconCheckMini /> : null}
            </View>
          </Pressable>
        ) : null}
        <Pressable
          delayLongPress={400}
          onPress={
            pane.selectionMode
              ? () => pane.toggleMessageSelected(msg.id)
              : undefined
          }
          onLongPress={
            isUser
              ? (event) => {
                  pane.openUserMenu(msg, event)
                }
              : undefined
          }
          // @ts-expect-error react-native-web context menu
          onContextMenu={
            isUser
              ? (event: { preventDefault?: () => void; nativeEvent?: { pageX?: number; pageY?: number }; pageX?: number; pageY?: number }) => {
                  event.preventDefault?.()
                  pane.openUserMenu(msg, event)
                }
              : undefined
          }
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
            isUser && checked ? styles.bubbleUserSelected : null,
            !isUser && checked ? styles.bubbleAssistantSelected : null,
          ]}
        >
          {msg.content ? (
            <View style={styles.streamBody}>
              <View style={styles.streamBodyRow}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <MessageMarkdown
                    text={stripSocraticMachineBlocks(msg.content)}
                    align="left"
                  />
                </View>
                {streamingThis ? (
                  <View style={styles.streamCursorSlot}>
                    <StreamCursor />
                  </View>
                ) : null}
              </View>
            </View>
          ) : streamingThis ? (
            <ThinkingHeartbeat />
          ) : null}
          {showTranslation && translation ? (
            <View style={styles.translationBox}>
              <Text style={styles.translationLabel}>
                译文（{translation.targetLanguage}）
              </Text>
              <MessageMarkdown text={translation.text} />
            </View>
          ) : null}
          {streamingThis ? (
            <View style={styles.actionsPlaceholder} />
          ) : isUser ? null : (
            <AssistantActions msg={msg} pane={pane} />
          )}
        </Pressable>
      </View>
    </View>
  )
}

function AssistantActions(props: {
  msg: ChatMessage
  pane: ReturnType<typeof useAgentRightPane>
}) {
  const { msg, pane } = props
  const hasText = Boolean(msg.content.trim())
  const speaking = pane.speakingId === msg.id
  const translating = Boolean(pane.translatingIds[msg.id])
  const translationVisible = Boolean(pane.visibleTranslationIds[msg.id])
  const icon = (active?: boolean) => (active ? colors.accent : colors.textSecondary)

  return (
    <View style={styles.actions}>
      {speaking && pane.ttsState === 'playing' ? (
        <>
          <ActionIcon
            label="暂停"
            active
            onPress={() => {
              getMobileTtsController().pause()
            }}
          >
            <IconPause size={15} color={colors.accent} />
          </ActionIcon>
          <ActionIcon
            label="停止"
            active
            onPress={() => {
              getMobileTtsController().stop()
              pane.setSpeakingId(null)
            }}
          >
            <IconStop size={15} color={colors.accent} />
          </ActionIcon>
        </>
      ) : speaking && pane.ttsState === 'paused' ? (
        <>
          <ActionIcon
            label="继续播放"
            active
            onPress={() => {
              getMobileTtsController().resume()
            }}
          >
            <IconPlay size={15} color={colors.accent} />
          </ActionIcon>
          <ActionIcon
            label="停止"
            active
            onPress={() => {
              getMobileTtsController().stop()
              pane.setSpeakingId(null)
            }}
          >
            <IconStop size={15} color={colors.accent} />
          </ActionIcon>
        </>
      ) : (
        <ActionIcon
          label="语音播放"
          onPress={() => pane.speakMessage(msg)}
          disabled={!hasText || pane.busy}
        >
          <IconSpeaker size={15} color={icon()} />
        </ActionIcon>
      )}

      <ActionIcon
        label={pane.copiedId === msg.id ? '已复制' : '复制'}
        active={pane.copiedId === msg.id}
        onPress={() => void pane.copyMessage(msg)}
        disabled={!hasText}
      >
        <IconCopy size={15} color={icon(pane.copiedId === msg.id)} />
      </ActionIcon>

      <ActionIcon
        label={translating ? '翻译中…' : translationVisible ? '隐藏译文' : '翻译'}
        active={translating || translationVisible}
        onPress={() => void pane.translateMessage(msg)}
        disabled={!hasText || translating || pane.busy}
      >
        <SpinningIcon spinning={translating}>
          <IconTranslate size={15} color={icon(translating || translationVisible)} />
        </SpinningIcon>
      </ActionIcon>

      <ActionIcon
        label="重新生成"
        onPress={() => void pane.regenerateAssistant(msg.id)}
        disabled={!hasText || pane.busy}
      >
        <IconRefresh size={15} color={icon()} />
      </ActionIcon>

      <ActionIcon label="从此处分叉" onPress={() => pane.forkFromMessage(msg.id)} disabled={pane.busy}>
        <IconGitFork size={15} color={icon()} />
      </ActionIcon>

      <ActionIcon
        label="保存到笔记"
        onPress={() => pane.saveToNote(msg)}
        disabled={!hasText}
      >
        <IconSaveNote size={15} color={icon()} />
      </ActionIcon>

      <ActionIcon label="删除" onPress={() => pane.deleteMessage(msg.id)} disabled={pane.busy}>
        <IconTrashMsg size={15} color={icon()} />
      </ActionIcon>
    </View>
  )
}

function IconCheckMini() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Polyline
        points="20 6 9 17 4 12"
        stroke="#ffffff"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ActionIcon(props: {
  children: ReactNode
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.actionBtn,
        props.active ? styles.actionBtnActive : null,
        props.disabled ? styles.actionBtnDisabled : null,
      ]}
      hitSlop={6}
    >
      {props.children}
    </Pressable>
  )
}
