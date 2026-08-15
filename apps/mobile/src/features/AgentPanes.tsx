import { type ReactNode } from 'react'
import type { ChatMessage } from '../state/MobileAppContext'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
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
import { colors, shellStyles } from '../theme'
import { getMobileTtsController } from '../voice'
import { STREAM_PAD_SIDE, formatMessageTime } from './agentPaneUtils'
import { ChatComposer } from './ChatComposer'
import { ChatMessageContextMenu } from './ChatMessageContextMenu'
import { MessageMarkdown } from './MessageMarkdown'
import { ThinkingHeartbeat } from './ThinkingHeartbeat'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SwipeableTopicRow } from './SwipeableTopicRow'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import { useAgentLeftPane } from './useAgentLeftPane'
import { useAgentRightPane } from './useAgentRightPane'

export function AgentLeftPane() {
  const {
    scopedSessions,
    activeSessionId,
    renamingId,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    setOpenSwipeId,
    layout,
    createSession,
    commitRename,
    confirmDelete,
    beginRename,
    selectSession,
  } = useAgentLeftPane()

  return (
    <SidebarShell>
      <SidebarAddButton label="新建话题" onPress={createSession} />
      <SidebarList>
        {scopedSessions.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无话题</Text>
        ) : (
          scopedSessions.map((session) => {
            const active = activeSessionId === session.id
            const renaming = renamingId === session.id
            if (renaming) {
              return (
                <View
                  key={session.id}
                  style={[
                    topicStyles.renameWrap,
                    { minHeight: layout.rowMinHeight },
                    active ? topicStyles.renameWrapActive : null,
                  ]}
                >
                  <TextInput
                    style={[topicStyles.renameInput, { fontSize: layout.topicFontSize }]}
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    onSubmitEditing={() => commitRename(session.id)}
                    onBlur={() => commitRename(session.id)}
                    placeholder="话题名称"
                    placeholderTextColor={colors.textSecondary}
                    underlineColorAndroid="transparent"
                  />
                </View>
              )
            }
            return (
              <SwipeableTopicRow
                key={session.id}
                active={active}
                open={openSwipeId === session.id}
                onOpenChange={(open) => setOpenSwipeId(open ? session.id : null)}
                onPress={() => selectSession(session.id)}
                onRename={() => beginRename(session)}
                onDelete={() => confirmDelete(session)}
                renameA11yLabel="重命名话题"
                deleteA11yLabel="删除话题"
              >
                <Text
                  style={[
                    sidebarStyles.itemLabel,
                    active ? sidebarStyles.itemLabelActive : null,
                    topicStyles.title,
                    { fontSize: layout.topicFontSize, lineHeight: layout.topicFontSize + 6 },
                  ]}
                  numberOfLines={1}
                >
                  {session.title}
                </Text>
              </SwipeableTopicRow>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

const topicStyles = StyleSheet.create({
  title: {
    fontWeight: '400',
  },
  renameWrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  renameWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  renameInput: {
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
  },
})

export function AgentRightPane() {
  const pane = useAgentRightPane()
  useRegisterModulePanelStatus('classroom-sync', pane.classroomStatus)

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={pane.streamScrollRef}
        style={styles.streamScroll}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => pane.scrollStreamToEnd(false)}
        // @ts-expect-error react-native-web className
        className="tm-agent-stream-scroll"
      >
        {!pane.session || pane.session.messages.length === 0 ? (
          <Text style={shellStyles.emptyHint}>
            {pane.agentScope === 'classroom'
              ? '在下方提问开始上课。'
              : '在下方输入问题开始对话。可先点击「Toolman」配置 API，或新建左侧会话。对话会保存在本机。'}
          </Text>
        ) : (
          pane.session.messages.map((msg) => {
            const isUser = msg.role === 'user'
            const streamingThis =
              pane.busy &&
              msg.role === 'assistant' &&
              msg.id === pane.session!.messages[pane.session!.messages.length - 1]?.id
            const translation = pane.translations[msg.id]
            const showTranslation = Boolean(translation && pane.visibleTranslationIds[msg.id])
            const checked = pane.selectedIds.has(msg.id)
            return (
              <View
                key={msg.id}
                style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}
              >
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
                  <View style={[styles.bubbleMeta, isUser ? styles.bubbleMetaUser : null]}>
                    <Text style={styles.bubbleRole}>{isUser ? '我的' : '智能体'}</Text>
                    <Text style={styles.bubbleTime}>{formatMessageTime(msg.createdAt)}</Text>
                  </View>
                  {msg.content ? (
                    <MessageMarkdown
                      text={stripSocraticMachineBlocks(msg.content)}
                      align={isUser ? 'right' : 'left'}
                    />
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
                  {streamingThis && !msg.content ? (
                    <View style={styles.actionsPlaceholder} />
                  ) : isUser ? null : (
                    <AssistantActions
                      msg={msg}
                      pane={pane}
                    />
                  )}
                </Pressable>
              </View>
            )
          })
        )}
      </ScrollView>

      {pane.error ? <Text style={styles.error}>{pane.error}</Text> : null}
      {pane.actionHint ? <Text style={styles.hint}>{pane.actionHint}</Text> : null}

      <ChatComposer
        value={pane.input}
        onChangeText={pane.setInput}
        busy={pane.busy}
        onSend={() => void pane.send()}
        onStop={() => pane.abortRef.current?.abort()}
        classLive={pane.classLive}
        classToggleDisabled={!pane.classroomCourse}
        onToggleClass={
          pane.agentScope === 'classroom' ? pane.toggleClass : undefined
        }
        webSearchEnabled={pane.webSearchEnabled}
        onToggleWebSearch={() => pane.patchToolbar({ webSearchEnabled: !pane.webSearchEnabled })}
        kbEnabled={pane.kbEnabled}
        onToggleKb={() => pane.patchToolbar({ kbEnabled: !pane.kbEnabled })}
        useDesktopHost={pane.useDesktopHost}
        onToggleDesktopHost={() => pane.patchToolbar({ useDesktopHost: !pane.useDesktopHost })}
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
        onNewTopic={
          pane.agentScope === 'classroom' ? undefined : pane.startNewTopic
        }
        onClear={() => pane.setInput('')}
        onError={pane.setError}
      />

      <ChatMessageContextMenu
        visible={Boolean(pane.userMenu)}
        x={pane.userMenu?.x ?? 0}
        y={pane.userMenu?.y ?? 0}
        onClose={() => pane.setUserMenu(null)}
        items={
          pane.userMenu
            ? [
                {
                  id: 'copy',
                  label: '复制',
                  onPress: () => {
                    void pane.copyMessage(pane.userMenu!.msg)
                  },
                },
                {
                  id: 'edit',
                  label: '编辑',
                  onPress: () => pane.editUserMessage(pane.userMenu!.msg),
                },
                {
                  id: 'delete',
                  label: '删除',
                  danger: true,
                  onPress: () => pane.deleteMessage(pane.userMenu!.msg.id),
                },
                {
                  id: 'select',
                  label: '选择',
                  onPress: () => pane.enterMessageSelection(pane.userMenu!.msg.id),
                },
                {
                  id: 'select-all',
                  label: '全选',
                  onPress: pane.selectAllMessages,
                },
                {
                  id: 'cancel',
                  label: '取消',
                  onPress: pane.clearUserMessageSelection,
                },
              ]
            : []
        }
      />
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
        <IconTranslate size={15} color={icon(translating || translationVisible)} />
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

const styles = StyleSheet.create({
  streamScroll: {
    flex: 1,
  },
  streamContent: {
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 22,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    alignSelf: 'stretch',
  },
  selectHit: {
    width: 28,
    height: 28,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginVertical: 2,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    flexShrink: 1,
    backgroundColor: colors.accentSoft,
  },
  bubbleUserSelected: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bubbleAssistant: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleAssistantSelected: {
    borderColor: colors.accent,
    backgroundColor: '#f3fbf7',
  },
  bubbleMeta: {
    marginBottom: 4,
  },
  bubbleMetaUser: {
    alignItems: 'flex-end',
  },
  bubbleRole: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bubbleTime: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 8,
    paddingTop: 4,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  translationBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  translationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionsPlaceholder: {
    height: 34,
    marginTop: 8,
  },
  error: {
    color: colors.danger,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
  hint: {
    color: colors.accent,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
})
