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
  type KnowledgeMetaItem,
} from '@toolman/shared'
import { colors } from '../theme'
import { CLASSROOM_PRESET_DESCS, CLASSROOM_PRESET_LABELS } from './classroomSidebar'
import { ClassroomTextbookKbPicker } from './ClassroomTextbookKbPicker'
import { formatClassroomKbSelectionLabel } from './classroomKbDisplay'

export type ClassroomCreateCourseInput = {
  courseName: string
  presetId: AssistantLibPresetId
  kbIds: string[]
  kbLabel?: string
  generateSyllabus: boolean
}

type Props = {
  visible: boolean
  knowledgeMeta: KnowledgeMetaItem[]
  onClose: () => void
  onCreate: (input: ClassroomCreateCourseInput) => void | Promise<void>
}

export function ClassroomCreateCourseModal(props: Props) {
  const { visible, knowledgeMeta, onClose, onCreate } = props
  const presets = useMemo(
    () => listSelectableAssistantLibPresets().filter((preset) => preset.id !== 'toolman-guide'),
    [],
  )
  const [courseName, setCourseName] = useState('')
  const [presetId, setPresetId] = useState<AssistantLibPresetId>('socratic-tutor')
  const [selectedKb, setSelectedKb] = useState<KnowledgeMetaItem | null>(null)
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [generateSyllabus, setGenerateSyllabus] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setCourseName('')
    setPresetId('socratic-tutor')
    setSelectedKb(null)
    setKbPickerOpen(false)
    setGenerateSyllabus(true)
    setSubmitting(false)
    setError(null)
  }, [visible])

  const selected = presets.find((item) => item.id === presetId) ?? presets[0]

  const handleCreate = async () => {
    const name = courseName.trim()
    if (!name) {
      setError('请填写课程名称')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onCreate({
        courseName: name,
        presetId,
        kbIds: selectedKb ? [selectedKb.id] : [],
        kbLabel: selectedKb ? formatClassroomKbSelectionLabel(selectedKb) : undefined,
        generateSyllabus: Boolean(selectedKb) && generateSyllabus,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <>
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
                    当前模式：{CLASSROOM_PRESET_LABELS[selected.id] ?? selected.name}
                  </Text>
                ) : null}

                <Text style={styles.label}>教材知识库</Text>
                <View style={styles.pathRow}>
                  <View style={styles.pathBox}>
                    <Text style={styles.pathText} numberOfLines={2}>
                      {selectedKb
                        ? formatClassroomKbSelectionLabel(selectedKb)
                        : '未选择教材'}
                    </Text>
                  </View>
                  <Pressable onPress={() => setKbPickerOpen(true)} style={styles.pathBtn}>
                    <Text style={styles.pathBtnText}>选择</Text>
                  </Pressable>
                </View>
                {selectedKb ? (
                  <Pressable
                    onPress={() => {
                      setSelectedKb(null)
                      setError(null)
                    }}
                    style={styles.clearBtn}
                  >
                    <Text style={styles.clearBtnText}>清除选择</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.hint}>
                  可从桌面端知识库选择，或点「添加教材」在桌面新建空教材库后再导入文件。
                </Text>

                {selectedKb ? (
                  <Pressable
                    onPress={() => setGenerateSyllabus((value) => !value)}
                    style={styles.toggleRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toggleTitle}>添加后生成教学大纲</Text>
                      <Text style={styles.hint}>需开启课堂同步，并由桌面宿主完成生成</Text>
                    </View>
                    <View style={[styles.switchTrack, generateSyllabus ? styles.switchTrackOn : null]}>
                      <View
                        style={[styles.switchThumb, generateSyllabus ? styles.switchThumbOn : null]}
                      />
                    </View>
                  </Pressable>
                ) : null}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  onPress={onClose}
                  style={[styles.footerBtn, styles.footerBtnSecondary]}
                  disabled={submitting}
                >
                  <Text style={styles.footerBtnSecondaryText}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleCreate()}
                  style={[styles.footerBtn, styles.footerBtnPrimary]}
                  disabled={submitting}
                >
                  <Text style={styles.footerBtnPrimaryText}>{submitting ? '添加中…' : '添加'}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ClassroomTextbookKbPicker
        visible={kbPickerOpen}
        selectedKbId={selectedKb?.id ?? null}
        fallbackItems={knowledgeMeta}
        onClose={() => setKbPickerOpen(false)}
        onSelect={(item) => {
          setSelectedKb(item)
          setKbPickerOpen(false)
          setError(null)
        }}
      />
    </>
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
  pathRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  pathBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.hover,
    justifyContent: 'center',
  },
  pathText: { fontSize: 12, color: colors.textSecondary },
  pathBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  pathBtnText: { fontSize: 13, fontWeight: '500', color: colors.text },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  clearBtnText: { fontSize: 12, color: colors.accent },
  hint: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, marginTop: 4 },
  toggleTitle: { fontSize: 13, fontWeight: '500', color: colors.text },
  switchTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d4d4d4',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchTrackOn: { backgroundColor: colors.accent },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  switchThumbOn: { alignSelf: 'flex-end' },
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
