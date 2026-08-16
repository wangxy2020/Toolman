import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'

type Props = {
  visible: boolean
  onClose: () => void
  onJoin: (input: string) => { ok: true } | { ok: false; message: string }
}

export function GroupJoinModal(props: Props) {
  const { visible, onClose, onJoin } = props
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setValue('')
      setError(null)
    }
  }, [visible])

  const submit = () => {
    const result = onJoin(value)
    if (result.ok) {
      onClose()
      return
    }
    setError(result.message)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>加入群组</Text>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <Text style={styles.hint}>
              粘贴电脑端邀请链接（toolman://join）。同一局域网或 Tailscale 下会向群主电脑登记。浏览器（Expo web）还会尝试建立直连。
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(text) => {
                setValue(text)
                if (error) setError(null)
              }}
              placeholder="toolman://join?token=…"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={submit}
              style={({ pressed }) => [styles.actionBtn, pressed ? styles.actionBtnPressed : null]}
            >
              <Text style={styles.actionBtnText}>加入</Text>
            </Pressable>
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
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
  actionBtn: {
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
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
})
