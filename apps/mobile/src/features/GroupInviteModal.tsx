import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GroupInvite } from '../storage/groupChat'
import { colors } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { formatInviteExpiry } from './groupActivity'

type Props = {
  visible: boolean
  groupName: string
  invite: GroupInvite | null
  onClose: () => void
}

export function GroupInviteModal(props: Props) {
  const { visible, groupName, invite, onClose } = props
  const [copied, setCopied] = useState<'url' | 'token' | null>(null)

  useEffect(() => {
    if (!visible) setCopied(null)
  }, [visible])

  const expired = Boolean(invite && invite.expiresAt <= Date.now())
  const ready = Boolean(invite && !expired)
  const expiresLabel = invite ? formatInviteExpiry(invite.expiresAt) : ''

  const handleCopy = async (text: string, kind: 'url' | 'token') => {
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopied(kind)
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              邀请加入「{groupName}」
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={styles.qrWrap}>
              <View style={styles.qrCard}>
                {ready ? (
                  <View style={styles.qrPlaceholder}>
                    <View style={styles.qrDot} />
                    <Text style={styles.qrCenter}>群</Text>
                    <Text style={styles.qrToken} numberOfLines={2}>
                      {invite?.token}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.qrMuted}>
                      {expired ? '邀请已过期，请关闭后重试' : '正在生成邀请…'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.hint}>
              {ready
                ? `扫描二维码请使用桌面端；也可复制邀请链接发送给其他成员。有效期至 ${expiresLabel}。`
                : expired
                  ? '邀请生成失败，请关闭后重试。'
                  : '正在生成邀请链接…'}
            </Text>

            <Text style={styles.linkLabel}>邀请链接</Text>
            <TextInput
              style={styles.linkInput}
              value={invite?.url ?? ''}
              editable={false}
              selectTextOnFocus
            />

            <View style={styles.actions}>
              <Pressable
                disabled={!ready}
                onPress={() => {
                  if (invite) void handleCopy(invite.url, 'url')
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  !ready ? styles.actionBtnDisabled : null,
                  pressed && ready ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>
                  {copied === 'url' ? '已复制' : '复制链接'}
                </Text>
              </Pressable>
              <Pressable
                disabled={!ready}
                onPress={() => {
                  if (invite) void handleCopy(invite.token, 'token')
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  !ready ? styles.actionBtnDisabled : null,
                  pressed && ready ? styles.actionBtnPressed : null,
                ]}
              >
                <Text style={styles.actionBtnText}>
                  {copied === 'token' ? '已复制' : '复制邀请码'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 10,
  },
  qrWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  qrCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  qrPlaceholder: {
    width: 176,
    height: 176,
    borderRadius: 8,
    backgroundColor: colors.hover,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  qrDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  qrCenter: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
  },
  qrToken: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  qrMuted: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  linkLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  linkInput: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  actionBtnPressed: {
    backgroundColor: colors.hover,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
})
