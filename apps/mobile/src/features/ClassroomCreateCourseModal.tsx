import { useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  listSelectableAssistantLibPresets,
  type AssistantLibPresetId,
} from '@toolman/shared'
import { colors } from '../theme'
import { CLASSROOM_PRESET_DESCS, CLASSROOM_PRESET_LABELS } from './classroomSidebar'

type Props = {
  visible: boolean
  onClose: () => void
  onCreate: (input: { courseName: string; presetId: AssistantLibPresetId }) => void
}

export function ClassroomCreateCourseModal(props: Props) {
  const { visible, onClose, onCreate } = props
  const presets = useMemo(
    () => listSelectableAssistantLibPresets().filter((preset) => preset.id !== 'toolman-guide'),
    [],
  )
  const [courseName, setCourseName] = useState('')
  const [presetId, setPresetId] = useState<AssistantLibPresetId>('socratic-tutor')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setCourseName('')
    setPresetId('socratic-tutor')
    setError(null)
  }, [visible])

  const selected = presets.find((item) => item.id === presetId) ?? presets[0]

  const handleCreate = () => {
    const name = courseName.trim()
    if (!name) {
      setError('请填写课程名称')
      return
    }
    onCreate({ courseName: name, presetId })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.titleDot} />
                <Text style={styles.title}>添加课程</Text>
              </View>
              <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.label}>
                课程名称<Text style={styles.required}> *</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={courseName}
                onChangeText={(value) => {
                  setCourseName(value)
                  setError(null)
                }}
                placeholder="请输入课程名称"
                placeholderTextColor={colors.textSecondary}
                maxLength={80}
              />

              <Text style={styles.label}>教学模式</Text>
              <View style={styles.presetList}>
                {presets.map((preset) => {
                  const active = preset.id === presetId
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => setPresetId(preset.id)}
                      style={[styles.presetRow, active ? styles.presetRowActive : null]}
                    >
                      <Text style={[styles.presetName, active ? styles.presetNameActive : null]}>
                        {CLASSROOM_PRESET_LABELS[preset.id] ?? preset.name}
                      </Text>
                      <Text style={styles.presetDesc}>
                        {CLASSROOM_PRESET_DESCS[preset.id] ?? preset.description}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {selected ? (
                <Text style={styles.hint}>
                  教材知识库请在桌面端绑定后同步。当前模式：
                  {CLASSROOM_PRESET_LABELS[selected.id] ?? selected.name}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable onPress={onClose} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                <Text style={styles.footerBtnSecondaryText}>取消</Text>
              </Pressable>
              <Pressable onPress={handleCreate} style={[styles.footerBtn, styles.footerBtnPrimary]}>
                <Text style={styles.footerBtnPrimaryText}>添加</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    maxHeight: '88%',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  titleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  body: { padding: 16, gap: 8 },
  label: { marginTop: 6, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  required: { color: colors.danger },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  presetList: { gap: 6, marginTop: 4 },
  presetRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  presetRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  presetName: { fontSize: 13, fontWeight: '500', color: colors.text },
  presetNameActive: { color: colors.accent },
  presetDesc: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  error: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220,38,38,0.08)',
    fontSize: 12,
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: { backgroundColor: colors.hover },
  footerBtnPrimary: { backgroundColor: colors.accent },
  footerBtnSecondaryText: { fontSize: 13, fontWeight: '500', color: colors.text },
  footerBtnPrimaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
})
