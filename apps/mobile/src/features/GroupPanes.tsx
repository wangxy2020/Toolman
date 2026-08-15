import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { loadCreatedKnowledgeBases } from '../storage/createdKnowledgeBases'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import type { GroupInvite, GroupSharedKind } from '../storage/groupChat'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { ChatComposer } from './ChatComposer'
import { GroupInviteModal } from './GroupInviteModal'
import {
  GroupActivityPane,
  GroupMembersPane,
  GroupSharedResourcePane,
} from './GroupPagePanels'
import type { GroupPickerSelection } from './GroupResourcePickerModal'
import {
  GROUP_SIDEBAR_MENUS,
  getGroupSidebarMenu,
} from './groupSidebar'
import { MessageMarkdown } from './MessageMarkdown'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import {
  STREAM_PAD_SIDE,
  buildGroupPickerGroups,
  formatMessageTime,
  groupKnowledgeDocsByKb,
  sharedItemsFromPickerSelection,
} from './groupPaneUtils'
import { useGroupChat } from './useGroupChat'

export { useOptionalGroupChat, GroupChatProvider } from './useGroupChat'

export function GroupLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    createGroup,
    selectGroup,
    selectGroupAction,
    expanded,
    toggleExpanded,
  } = useGroupChat()

  return (
    <SidebarShell>
      <SidebarAddButton
        label="创建群组"
        onPress={() => {
          createGroup()
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        {groups.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无群组</Text>
        ) : (
          groups.map((group) => {
            const isOpen = expanded.has(group.id)
            const isActive = group.id === activeGroupId
            return (
              <View key={group.id} style={styles.groupBlock}>
                <View style={[styles.groupRow, isActive ? styles.groupRowActive : null]}>
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠' : '展开'}
                    onPress={() => toggleExpanded(group.id)}
                    style={({ pressed }) => [
                      styles.expandHit,
                      pressed ? styles.expandHitPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.chevron, isOpen ? styles.chevronOpen : null]}
                      accessibilityElementsHidden
                    >
                      ›
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      selectGroup(group.id)
                      setLeftOpen(false)
                    }}
                    style={styles.groupNameHit}
                  >
                    <Text
                      style={[styles.groupName, isActive ? styles.groupNameActive : null]}
                      numberOfLines={1}
                    >
                      {group.name}
                    </Text>
                  </Pressable>
                </View>
                {isOpen
                  ? GROUP_SIDEBAR_MENUS.map((menu) => {
                      const childActive = isActive && activeAction === menu.id
                      return (
                        <Pressable
                          key={menu.id}
                          onPress={() => {
                            selectGroupAction(group.id, menu.id)
                            setLeftOpen(false)
                          }}
                          style={({ pressed }) => [
                            styles.subItem,
                            childActive ? styles.subItemActive : null,
                            pressed && !childActive ? styles.subItemPressed : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subItemLabel,
                              childActive ? styles.subItemLabelActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {menu.label}
                          </Text>
                        </Pressable>
                      )
                    })
                  : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function GroupRightPane() {
  const { auth, sessions, notebooks, notes, knowledgeMeta } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    ready,
    members,
    sharedItems,
    activities,
    addSharedItems,
    createOrReuseInvite,
  } = useGroupChat()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState<GroupInvite | null>(null)
  const [createdKbs, setCreatedKbs] = useState<Array<{ id: string; name: string }>>([])
  const [docsByKb, setDocsByKb] = useState<Record<string, Array<{ id: string; name: string }>>>({})
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null
  const selfMemberId = auth?.identityId ?? 'local-self'

  useEffect(() => {
    if (activeAction !== 'knowledge') return
    void loadCreatedKnowledgeBases().then((items) =>
      setCreatedKbs(items.map((item) => ({ id: item.id, name: item.name }))),
    )
    void loadKnowledgeSnapshot().then((snapshot) => {
      if (!snapshot) return
      setDocsByKb(groupKnowledgeDocsByKb(snapshot.documents))
    })
  }, [activeAction])

  const pickerGroups = useMemo(
    () =>
      buildGroupPickerGroups({
        activeAction,
        sharedItems,
        sessions,
        notebooks,
        notes,
        knowledgeMeta,
        createdKbs,
        docsByKb,
      }),
    [
      activeAction,
      createdKbs,
      docsByKb,
      knowledgeMeta,
      notebooks,
      notes,
      sessions,
      sharedItems,
    ],
  )

  if (!ready) {
    return <Text style={shellStyles.emptyHint}>加载群组…</Text>
  }

  if (!activeGroup) {
    return (
      <View style={styles.emptyPane}>
        <Text style={styles.emptyTitle}>选择或创建群组</Text>
        <Text style={styles.emptyHint}>
          在左侧创建群组，或展开群组后选择成员、消息、智能体等二级菜单。
        </Text>
      </View>
    )
  }

  const handleAddShared = (kind: GroupSharedKind, selection: GroupPickerSelection[]) => {
    addSharedItems(kind, sharedItemsFromPickerSelection(kind, selection))
  }

  return (
    <>
      {activeAction === 'messages' ? <GroupMessagesPane /> : null}
      {activeAction === 'members' ? (
        <GroupMembersPane
          groupName={activeGroup.name}
          members={members}
          selfMemberId={selfMemberId}
          onInvite={() => {
            setInvite(createOrReuseInvite())
            setInviteOpen(true)
          }}
        />
      ) : null}
      {activeAction === 'activity' ? (
        <GroupActivityPane groupName={activeGroup.name} events={activities} />
      ) : null}
      {activeAction === 'agents' ||
      activeAction === 'knowledge' ||
      activeAction === 'notes' ||
      activeAction === 'workflow' ? (
        <GroupSharedResourcePane
          kind={activeAction}
          title={getGroupSidebarMenu(activeAction).title}
          typeNoun={getGroupSidebarMenu(activeAction).typeNoun}
          groupName={activeGroup.name}
          items={sharedItems.filter((item) => item.kind === activeAction)}
          pickerGroups={pickerGroups}
          onAdd={(selection) => handleAddShared(activeAction, selection)}
        />
      ) : null}
      <GroupInviteModal
        visible={inviteOpen}
        groupName={activeGroup.name}
        invite={invite}
        onClose={() => setInviteOpen(false)}
      />
    </>
  )
}

function GroupMessagesPane() {
  const { auth } = useMobileApp()
  const { activeGroupId, messages, sendMessage, deleteMessage, clearOwnMessages } = useGroupChat()
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [composerPopupOpen, setComposerPopupOpen] = useState(false)
  const [popupDismissToken, setPopupDismissToken] = useState(0)
  const streamScrollRef = useRef<ScrollView>(null)
  const selfMemberId = auth?.identityId ?? 'local-self'
  const selfName = auth?.displayName?.trim() || '我'

  const scrollToEnd = (animated = false) => {
    requestAnimationFrame(() => {
      streamScrollRef.current?.scrollToEnd({ animated })
    })
  }

  useEffect(() => {
    scrollToEnd(false)
  }, [activeGroupId, messages.length])

  useEffect(() => {
    setMenuMessageId(null)
  }, [activeGroupId])

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeGroupId) return
    sendMessage({
      content: text,
      senderMemberId: selfMemberId,
      senderName: selfName,
    })
    setInput('')
    setMenuMessageId(null)
    scrollToEnd(true)
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {composerPopupOpen ? (
          <Pressable
            style={styles.popupDismiss}
            onPress={() => {
              setPopupDismissToken((n) => n + 1)
              setComposerPopupOpen(false)
            }}
            accessibilityLabel="关闭菜单"
          />
        ) : null}
        <ScrollView
          ref={streamScrollRef}
          style={styles.streamScroll}
          contentContainerStyle={styles.streamContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToEnd(false)}
          onScrollBeginDrag={() => {
            setMenuMessageId(null)
            if (composerPopupOpen) {
              setPopupDismissToken((n) => n + 1)
              setComposerPopupOpen(false)
            }
          }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <Text style={shellStyles.emptyHint}>
              暂无消息{'\n'}在这里输入消息，按 Enter 发送
            </Text>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.senderMemberId === selfMemberId
              const showActions = menuMessageId === msg.id
              return (
                <Pressable
                  key={msg.id}
                  onLongPress={() => setMenuMessageId(msg.id)}
                  delayLongPress={350}
                  onPress={() => {
                    if (menuMessageId) setMenuMessageId(null)
                    if (composerPopupOpen) {
                      setPopupDismissToken((n) => n + 1)
                      setComposerPopupOpen(false)
                    }
                  }}
                  style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapPeer]}
                >
                  <View style={[styles.bubbleMeta, isOwn ? styles.bubbleMetaOwn : null]}>
                    <Text style={styles.bubbleRole}>
                      {isOwn ? '我的' : msg.senderName || '成员'}
                    </Text>
                    <Text style={styles.bubbleTime}>{formatMessageTime(msg.createdAt)}</Text>
                  </View>
                  <View
                    style={[
                      styles.bubbleBody,
                      isOwn ? styles.bubbleBodyOwn : styles.bubbleBodyPeer,
                    ]}
                  >
                    <MessageMarkdown text={msg.content} align={isOwn ? 'right' : 'left'} />
                  </View>
                  {showActions ? (
                    <View style={[styles.actions, isOwn ? styles.actionsOwn : null]}>
                      <Pressable
                        accessibilityLabel={copiedId === msg.id ? '已复制' : '复制'}
                        onPress={() => {
                          void copyToClipboard(msg.content).then(() => {
                            setCopiedId(msg.id)
                            setTimeout(
                              () => setCopiedId((id) => (id === msg.id ? null : id)),
                              1200,
                            )
                          })
                        }}
                        style={styles.actionBtn}
                      >
                        <Text
                          style={[
                            styles.actionLabel,
                            copiedId === msg.id ? styles.actionLabelActive : null,
                          ]}
                        >
                          {copiedId === msg.id ? '已复制' : '复制'}
                        </Text>
                      </Pressable>
                      {isOwn ? (
                        <Pressable
                          accessibilityLabel="删除"
                          onPress={() => {
                            deleteMessage(msg.id)
                            setMenuMessageId(null)
                          }}
                          style={styles.actionBtn}
                        >
                          <Text style={styles.actionLabel}>删除</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>

      <ChatComposer
        mode="group"
        value={input}
        onChangeText={setInput}
        onSend={handleSend}
        onClearChat={() => clearOwnMessages(selfMemberId)}
        onPopupOpenChange={setComposerPopupOpen}
        popupDismissToken={popupDismissToken}
        placeholder="输入群组消息…"
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  groupBlock: {
    marginBottom: 2,
  },
  groupRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupRowActive: {
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  groupNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  groupNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  subItem: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
  },
  subItemActive: {
    backgroundColor: colors.accentSoft,
  },
  subItemPressed: {
    backgroundColor: colors.hover,
  },
  subItemLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  subItemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  emptyPane: {
    flex: 1,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  streamScroll: {
    flex: 1,
  },
  popupDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  streamContent: {
    paddingHorizontal: STREAM_PAD_SIDE,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
  },
  bubbleWrap: {
    maxWidth: '88%',
    gap: 4,
  },
  bubbleWrapOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapPeer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleMeta: {
    gap: 2,
  },
  bubbleMetaOwn: {
    alignItems: 'flex-end',
  },
  bubbleRole: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bubbleTime: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bubbleBody: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleBodyOwn: {
    backgroundColor: colors.accentSoft,
  },
  bubbleBodyPeer: {
    backgroundColor: colors.hover,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  actionsOwn: {
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionLabelActive: {
    color: colors.accent,
  },
})
