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
import { type AssistantLibPresetDef } from '@toolman/shared'
import { getMobileSyncBaseUrl } from '../sync/mobileSync'
import { colors } from '../theme'
import {
  CURATED_EDGE_TTS_VOICES,
  type VoiceTtsEngine,
} from '../voice'
import {
  CLASSROOM_PRESET_DESCS,
  CLASSROOM_PRESET_LABELS,
} from './classroomSidebar'
import { MessageMarkdown } from './MessageMarkdown'
import { useSettingsModalSize } from './settingsModalLayout'
import {
  CLASSROOM_SETTINGS_TABS,
  classroomPresetPatch,
  useClassroomSettingsModal,
  type ClassroomSettingsDraft,
  type ClassroomSettingsModalProps,
} from './useClassroomSettingsModal'

export function ClassroomSettingsModal(props: ClassroomSettingsModalProps) {
  const {
    visible,
    course,
    knowledgeNames,
    classroomSyncEnabled,
    desktopHostsOnline,
    onClassroomSyncEnabledChange,
    onClose,
  } = props
  const { width: dialogWidth, height: dialogHeight } = useSettingsModalSize()
  const {
    activeTab,
    selectTab,
    draft,
    editingDoc,
    setEditingDoc,
    error,
    confirmDelete,
    setConfirmDelete,
    courseLabel,
    isGuide,
    isDefault,
    shownPresets,
    selectedPreset,
    updateDraft,
    handleSave,
    handleDelete,
    docValue,
    setDocValue,
  } = useClassroomSettingsModal(props)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
          <View
            style={[styles.dialog, { width: dialogWidth, height: dialogHeight }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.titleDot} />
                <Text style={styles.title} numberOfLines={1}>
                  {courseLabel}设置
                </Text>
              </View>
              <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            {!course || !draft ? (
              <View style={styles.emptyBody}>
                <Text style={styles.hint}>请先在侧栏选择一门课程。</Text>
              </View>
            ) : (
              <>
                <View style={styles.body}>
                  <View style={styles.nav}>
                    {CLASSROOM_SETTINGS_TABS.map((tab) => {
                      const active = activeTab === tab.id
                      return (
                        <Pressable
                          key={tab.id}
                          onPress={() => selectTab(tab.id)}
                          style={[styles.navItem, active ? styles.navItemActive : null]}
                        >
                          <Text style={[styles.navItemText, active ? styles.navItemTextActive : null]}>
                            {tab.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentInner}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                  >
                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    {activeTab === 'basic' ? (
                      <BasicTab
                        draft={draft}
                        isDefault={isDefault}
                        shownPresets={shownPresets}
                        selectedPreset={selectedPreset}
                        knowledgeNames={knowledgeNames}
                        updateDraft={updateDraft}
                      />
                    ) : null}

                    {activeTab === 'teaching' || activeTab === 'lesson' ? (
                      <DocTab
                        kind={activeTab}
                        value={docValue}
                        editing={editingDoc}
                        onToggleEdit={() => setEditingDoc((value) => !value)}
                        onChange={setDocValue}
                      />
                    ) : null}

                    {activeTab === 'sync' ? (
                      <SyncTab
                        classroomSyncEnabled={classroomSyncEnabled}
                        desktopHostsOnline={desktopHostsOnline}
                        onClassroomSyncEnabledChange={onClassroomSyncEnabledChange}
                      />
                    ) : null}

                    {activeTab === 'danger' ? (
                      <View style={styles.dangerCard}>
                        {isDefault || isGuide ? (
                          <Text style={styles.hint}>
                            {isDefault ? '默认课程不可删除。' : 'Toolman使用说明课程不可删除。'}
                          </Text>
                        ) : (
                          <>
                            <Text style={styles.sectionTitle}>危险操作</Text>
                            <Text style={styles.hint}>
                              删除后将移除本课程课堂与对话记录，此操作不可撤销。教材知识库文件不会被删除。
                            </Text>
                            <Pressable
                              onPress={() => setConfirmDelete(true)}
                              style={({ pressed }) => [
                                styles.dangerBtn,
                                pressed ? styles.dangerBtnPressed : null,
                              ]}
                            >
                              <Text style={styles.dangerBtnText}>删除课程</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    ) : null}
                  </ScrollView>
                </View>

                <View style={styles.footer}>
                  <Pressable onPress={onClose} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                    <Text style={styles.footerBtnSecondaryText}>
                      {activeTab === 'danger' || activeTab === 'sync' ? '关闭' : '取消'}
                    </Text>
                  </Pressable>
                  {activeTab !== 'danger' && activeTab !== 'sync' ? (
                    <Pressable
                      onPress={handleSave}
                      style={[styles.footerBtn, styles.footerBtnPrimary]}
                    >
                      <Text style={styles.footerBtnPrimaryText}>保存</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>

      {confirmDelete ? (
        <View style={styles.confirmOverlay} pointerEvents="box-none">
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>删除课程</Text>
            <Text style={[styles.hint, { paddingHorizontal: 16 }]}>
              确定要删除「{courseLabel}」吗？课堂与对话记录将被移除，且不可恢复。
            </Text>
            <View style={styles.footer}>
              <Pressable
                onPress={() => setConfirmDelete(false)}
                style={[styles.footerBtn, styles.footerBtnSecondary]}
              >
                <Text style={styles.footerBtnSecondaryText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmDelete(false)
                  handleDelete()
                }}
                style={[styles.footerBtn, styles.confirmDangerBtn]}
              >
                <Text style={styles.confirmDangerText}>删除课程</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  )
}

function BasicTab(props: {
  draft: ClassroomSettingsDraft
  isDefault: boolean
  shownPresets: AssistantLibPresetDef[]
  selectedPreset: AssistantLibPresetDef | null | undefined
  knowledgeNames: string[]
  updateDraft: (patch: Partial<ClassroomSettingsDraft>) => void
}) {
  const { draft, isDefault, shownPresets, selectedPreset, knowledgeNames, updateDraft } = props
  return (
    <View style={styles.form}>
      <Text style={styles.hint}>为当前课堂配置名称、教学模式、教材知识库与朗读。</Text>
      <Text style={styles.label}>课程名称</Text>
      <TextInput
        style={[styles.input, isDefault ? styles.inputDisabled : null]}
        value={isDefault ? '默认课程' : draft.courseName}
        onChangeText={(value) => updateDraft({ courseName: value })}
        editable={!isDefault}
      />

      <Text style={styles.label}>教学模式</Text>
      <View style={styles.presetList}>
        {shownPresets.map((preset) => {
          const active = preset.id === draft.presetId
          return (
            <Pressable
              key={preset.id}
              onPress={() => updateDraft(classroomPresetPatch(draft, preset.id))}
              style={[styles.presetRow, active ? styles.presetRowActive : null]}
            >
              <Text style={[styles.presetName, active ? styles.presetNameActive : null]}>
                {CLASSROOM_PRESET_LABELS[preset.id] ?? preset.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {selectedPreset ? (
        <Text style={styles.hint}>
          {CLASSROOM_PRESET_DESCS[selectedPreset.id] ?? selectedPreset.description}
        </Text>
      ) : null}

      <ToggleRow
        title="答案裁判"
        hint="开启后拦截直接泄题的回答"
        value={draft.refereeEnabled}
        onChange={(value) => updateDraft({ refereeEnabled: value })}
      />

      <Text style={styles.label}>教材知识库</Text>
      <View style={styles.pathBox}>
        <Text style={styles.pathText}>
          {knowledgeNames.length > 0 ? knowledgeNames.join('、') : '未绑定教材'}
        </Text>
      </View>
      <Text style={styles.hint}>教材绑定请在桌面端课程设置中修改，同步后生效。</Text>

      <ToggleRow
        title="自动朗读"
        hint="助手回答完成后自动朗读（默认开启）"
        value={draft.autoSpeak}
        onChange={(value) => updateDraft({ autoSpeak: value })}
      />

      <Text style={styles.label}>语音引擎</Text>
      <ChoiceList
        value={draft.ttsEngine}
        options={[
          { id: 'edge', label: 'Edge 在线语音' },
          { id: 'web-speech', label: '系统语音' },
        ]}
        onChange={(id) => updateDraft({ ttsEngine: id as VoiceTtsEngine })}
      />
      {draft.ttsEngine === 'edge' ? (
        <>
          <Text style={styles.label}>Edge 音色</Text>
          <ChoiceList
            value={draft.ttsVoice}
            options={CURATED_EDGE_TTS_VOICES.map((voice) => ({
              id: voice.value,
              label: voice.label,
            }))}
            onChange={(id) => updateDraft({ ttsVoice: id })}
          />
        </>
      ) : null}
    </View>
  )
}

function DocTab(props: {
  kind: 'teaching' | 'lesson'
  value: string
  editing: boolean
  onToggleEdit: () => void
  onChange: (value: string) => void
}) {
  return (
    <View style={styles.form}>
      <View style={styles.docHeader}>
        <Text style={[styles.hint, { flex: 1 }]}>
          {props.kind === 'teaching'
            ? '当前课堂的教学模式提示词。未修改时沿用所选教学模式的默认内容。'
            : '当前课程的教学大纲，支持 Markdown 排版。'}
        </Text>
        <Pressable onPress={props.onToggleEdit} style={styles.inlineBtn}>
          <Text style={styles.inlineBtnText}>
            {props.editing ? '完成' : props.kind === 'teaching' ? '编辑教学模式' : '编辑大纲'}
          </Text>
        </Pressable>
      </View>
      {props.editing ? (
        <TextInput
          style={[styles.input, styles.textarea]}
          value={props.value}
          onChangeText={props.onChange}
          multiline
          textAlignVertical="top"
        />
      ) : props.value.trim() ? (
        <View style={styles.preview}>
          <MessageMarkdown text={props.value} />
        </View>
      ) : (
        <Text style={styles.hint}>
          {props.kind === 'teaching'
            ? '暂无教学模式内容。'
            : '暂无教学大纲。添加课程并绑定教材后将按章节自动生成。'}
        </Text>
      )}
    </View>
  )
}

function SyncTab(props: {
  classroomSyncEnabled: boolean
  desktopHostsOnline: number
  onClassroomSyncEnabledChange: (enabled: boolean) => void
}) {
  return (
    <View style={styles.form}>
      <Text style={styles.hint}>
        从本机桌面 Sync Hub 拉取课程、教学模式、教学大纲与课堂记录。不经过社区 Hub。
      </Text>
      <ToggleRow
        title="接收桌面端课程"
        hint="打开应用时同步一次，之后约每 3 分钟检查有变化的课程；手机上课、停课会回写到桌面"
        value={props.classroomSyncEnabled}
        onChange={props.onClassroomSyncEnabledChange}
      />
      <Text style={styles.label}>同步内容</Text>
      <Text style={styles.hint}>课程列表与课程名称</Text>
      <Text style={styles.hint}>教学模式与提示词</Text>
      <Text style={styles.hint}>教学大纲与章节进度</Text>
      <Text style={styles.hint}>课堂记录与学习掌握情况</Text>
      <Text style={styles.label}>同步服务</Text>
      <Text style={styles.pathText}>{getMobileSyncBaseUrl()}</Text>
      <Text style={styles.hint}>
        桌面宿主：{props.desktopHostsOnline > 0 ? `${props.desktopHostsOnline} 在线` : '无'}
      </Text>
    </View>
  )
}

function ToggleRow(props: {
  title: string
  hint: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable onPress={() => props.onChange(!props.value)} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{props.title}</Text>
        <Text style={styles.hint}>{props.hint}</Text>
      </View>
      <View style={[styles.switchTrack, props.value ? styles.switchTrackOn : null]}>
        <View style={[styles.switchThumb, props.value ? styles.switchThumbOn : null]} />
      </View>
    </Pressable>
  )
}

function ChoiceList(props: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <View style={styles.presetList}>
      {props.options.map((option) => {
        const active = option.id === props.value
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onChange(option.id)}
            style={[styles.presetRow, active ? styles.presetRowActive : null]}
          >
            <Text style={[styles.presetName, active ? styles.presetNameActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    flexDirection: 'column',
    flexShrink: 0,
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
    flexShrink: 0,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  nav: {
    width: 108,
    padding: 10,
    gap: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderLight,
    backgroundColor: '#fafafa',
    flexShrink: 0,
  },
  navItem: {
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navItemActive: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  navItemText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  navItemTextActive: { color: colors.accent, fontWeight: '600' },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
  contentInner: { padding: 16 },
  form: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textSecondary,
  },
  label: { marginTop: 6, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
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
  inputDisabled: { backgroundColor: colors.hover, color: colors.textSecondary },
  textarea: { minHeight: 180, textAlignVertical: 'top' },
  pathBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.hover,
  },
  pathText: { fontSize: 12, color: colors.textSecondary },
  presetList: { gap: 6 },
  presetRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  presetName: { fontSize: 13, fontWeight: '500', color: colors.text },
  presetNameActive: { color: colors.accent },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
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
  docHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  inlineBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  inlineBtnText: { fontSize: 12, fontWeight: '500', color: colors.text },
  preview: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.surface,
  },
  dangerCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.04)',
  },
  dangerBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 6,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dangerBtnPressed: { backgroundColor: 'rgba(239,68,68,0.06)' },
  dangerBtnText: { fontSize: 13, fontWeight: '500', color: colors.danger },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    flexShrink: 0,
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
  emptyBody: { flex: 1, paddingHorizontal: 20, paddingVertical: 28 },
  error: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220,38,38,0.08)',
    fontSize: 12,
    color: colors.danger,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmDialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    paddingTop: 16,
    overflow: 'hidden',
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  confirmDangerBtn: { backgroundColor: colors.danger },
  confirmDangerText: { fontSize: 13, fontWeight: '600', color: '#fff' },
})
