import { Pressable, Text, TextInput, View } from 'react-native'
import { type AssistantLibPresetDef } from '@toolman/shared'
import { getMobileSyncBaseUrl } from '../sync/mobileSync'
import { CURATED_EDGE_TTS_VOICES, type VoiceTtsEngine } from '../voice'
import { CLASSROOM_PRESET_DESCS, CLASSROOM_PRESET_LABELS } from './classroomSidebar'
import { classroomSettingsModalStyles as styles } from './classroomSettingsModalStyles'
import { MessageMarkdown } from './MessageMarkdown'
import {
  classroomPresetPatch,
  type ClassroomSettingsDraft,
} from './useClassroomSettingsModal'

export function ClassroomBasicTab(props: {
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

      <ClassroomToggleRow
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

      <ClassroomToggleRow
        title="自动朗读"
        hint="助手回答完成后自动朗读（默认开启）"
        value={draft.autoSpeak}
        onChange={(value) => updateDraft({ autoSpeak: value })}
      />

      <Text style={styles.label}>语音引擎</Text>
      <ClassroomChoiceList
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
          <ClassroomChoiceList
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

export function ClassroomDocTab(props: {
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

export function ClassroomSyncTab(props: {
  classroomSyncEnabled: boolean
  desktopHostsOnline: number
  onClassroomSyncEnabledChange: (enabled: boolean) => void
}) {
  return (
    <View style={styles.form}>
      <Text style={styles.hint}>
        从本机桌面 Sync Hub 拉取课程、教学模式、教学大纲与课堂记录。不经过社区 Hub。
      </Text>
      <ClassroomToggleRow
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

function ClassroomToggleRow(props: {
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

function ClassroomChoiceList(props: {
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
