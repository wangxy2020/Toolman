import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { resolveLivePeerMemberDisplayName } from '@toolman/shared'
import { useMobileApp } from '../state/MobileAppContext'
import { shellStyles } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { ChatComposer } from './ChatComposer'
import { groupPaneStyles as styles } from './groupPaneStyles'
import { STREAM_PAD_SIDE, formatMessageTime } from './groupPaneUtils'
import { isSelfGroupMember, memberAvatarInitial } from './groupPagePanelUtils'
import { MessageMarkdown } from './MessageMarkdown'
import { useGroupChat } from './useGroupChat'

export function GroupMessagesPane() {
  const { auth, device } = useMobileApp()
  const {
    activeGroupId,
    messages,
    members,
    sendMessage,
    attachFile,
    deleteMessage,
    clearOwnMessages,
    canShareToActiveGroup,
  } = useGroupChat()
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [composerPopupOpen, setComposerPopupOpen] = useState(false)
  const [popupDismissToken, setPopupDismissToken] = useState(0)
  const streamScrollRef = useRef<ScrollView>(null)
  const selfMemberId = auth?.identityId ?? 'local-self'
  const selfName = auth?.displayName?.trim() || ''
  const selfIds = new Set(
    [
      selfMemberId,
      device.deviceId,
      ...members
        .filter((member) =>
          isSelfGroupMember(member, {
            identityId: auth?.identityId,
            deviceId: device.deviceId,
          }),
        )
        .map((member) => member.id),
    ].filter(Boolean),
  )

  const pickAndAttachFile = () => {
    if (typeof document === 'undefined') return
    const inputEl = document.createElement('input')
    inputEl.type = 'file'
    inputEl.onchange = () => {
      const file = inputEl.files?.[0]
      if (!file) return
      void file.arrayBuffer().then((buffer) =>
        attachFile({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          bytes: new Uint8Array(buffer),
        }),
      )
    }
    inputEl.click()
  }

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
      senderName: selfName || '成员',
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
              暂无消息{'\n'}在这里输入消息，Mac 用 ⌘Enter 发送，Windows 用 Alt+Enter 发送
            </Text>
          ) : (
            messages.map((msg) => {
              const isOwn = selfIds.has(msg.senderMemberId)
              const showActions = menuMessageId === msg.id
              const displayName = isOwn
                ? '我的'
                : resolveLivePeerMemberDisplayName(members, msg.senderMemberId, msg.senderName)
              const avatarName = isOwn ? '我' : displayName
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
                  <View style={[styles.msgHead, isOwn ? styles.msgHeadOwn : null]}>
                    <View style={[styles.avatar, isOwn ? styles.avatarOwn : styles.avatarPeer]}>
                      <Text style={[styles.avatarText, isOwn ? styles.avatarTextOwn : styles.avatarTextPeer]}>
                        {memberAvatarInitial(avatarName)}
                      </Text>
                    </View>
                    <View style={[styles.msgMeta, isOwn ? styles.msgMetaOwn : null]}>
                      <Text style={styles.bubbleRole}>{displayName}</Text>
                      <Text style={styles.bubbleTime}>{formatMessageTime(msg.createdAt)}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.bubbleBody,
                      isOwn ? styles.bubbleBodyOwn : styles.bubbleBodyPeer,
                    ]}
                  >
                    {msg.content ? (
                      <MessageMarkdown text={msg.content} align="left" />
                    ) : null}
                    {msg.attachment ? (
                      <Text style={styles.attachmentLabel}>
                        {msg.attachment.mimeType.startsWith('image/') ? '图片' : '文件'} ·{' '}
                        {msg.attachment.name}
                      </Text>
                    ) : null}
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
        disabled={!canShareToActiveGroup}
        placeholder={canShareToActiveGroup ? '输入群组消息…' : '只读成员无法发送消息'}
        onAttachFile={canShareToActiveGroup ? pickAndAttachFile : undefined}
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
      />
    </View>
  )
}
