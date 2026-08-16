import { Pressable, Text, TextInput, View } from 'react-native'
import { getProviderPreset, MOBILE_PROVIDER_PRESETS } from '../settings/provider-presets'
import { colors } from '../theme'
import {
  CURATED_EDGE_TTS_VOICES,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'
import { ChoiceList, FieldRow, ToggleRow } from './agentSettingsFields'
import { agentSettingsModalStyles as styles } from './agentSettingsModalStyles'
import {
  AGENT_TRANSLATION_LANGS,
  useAgentModelOptions,
  type AgentSettingsDraft,
} from './useAgentSettingsModal'

export function AgentSettingsBasicTab(props: {
  draft: AgentSettingsDraft
  updateDraft: (patch: Partial<AgentSettingsDraft>) => void
}) {
  const { draft, updateDraft } = props
  const { preset, modelOptions } = useAgentModelOptions(draft)

  return (
    <View style={styles.form}>
      <FieldRow label="名称">
        <TextInput
          style={styles.input}
          value={draft.name}
          onChangeText={(name) => updateDraft({ name })}
        />
      </FieldRow>
      <FieldRow label="模型" hint="选择运行此智能体的本地或云端大模型">
        <View style={styles.chipRow}>
          {MOBILE_PROVIDER_PRESETS.map((item) => {
            const active = draft.providerId === item.id
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  const next = getProviderPreset(item.id)
                  updateDraft({
                    providerId: item.id,
                    model: next.defaultModel || draft.model,
                  })
                }}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item.name}</Text>
              </Pressable>
            )
          })}
        </View>
        <View style={styles.chipRow}>
          {modelOptions.map((id) => {
            const active = draft.model === id
            return (
              <Pressable
                key={id}
                onPress={() => updateDraft({ model: id })}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                  {id}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <TextInput
          style={styles.input}
          value={draft.model}
          onChangeText={(model) => updateDraft({ model })}
          placeholder={preset.defaultModel || '模型 ID'}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </FieldRow>
      <FieldRow label="工作目录">
        <TextInput
          style={[styles.input, styles.inputReadonly]}
          editable={false}
          value=""
          placeholder="未设置工作目录（请在桌面端配置）"
          placeholderTextColor={colors.textSecondary}
        />
      </FieldRow>
      <ToggleRow
        label="启用心跳"
        hint="定期触发智能体后台检查任务"
        value={draft.heartbeatEnabled}
        onChange={(heartbeatEnabled) => updateDraft({ heartbeatEnabled })}
      />
      <ToggleRow
        label="自动朗读回复"
        hint="开启后，智能体生成最终回答时将自动朗读（仍可在消息底部手动播放）"
        value={draft.autoSpeak}
        onChange={(autoSpeak) => updateDraft({ autoSpeak })}
      />
      <FieldRow label="语音引擎" hint="Edge 神经语音更自然（需联网，无需 API 密钥）">
        <ChoiceList
          value={draft.ttsEngine}
          options={[
            { id: 'edge', label: 'Edge 神经语音（推荐，免密钥）' },
            { id: 'web-speech', label: '系统语音（Web Speech）' },
          ]}
          onChange={(id) => updateDraft({ ttsEngine: id as VoiceTtsEngine })}
        />
      </FieldRow>
      {draft.ttsEngine === 'edge' ? (
        <FieldRow label="朗读音色">
          <ChoiceList
            value={draft.ttsVoice}
            options={CURATED_EDGE_TTS_VOICES.map((voice) => ({
              id: voice.value,
              label: voice.label,
            }))}
            onChange={(id) => updateDraft({ ttsVoice: resolveCuratedEdgeTtsVoice(id) })}
          />
        </FieldRow>
      ) : null}
      <FieldRow label="间隔 (分钟)">
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            keyboardType="number-pad"
            value={String(draft.heartbeatIntervalMinutes)}
            onChangeText={(value) =>
              updateDraft({ heartbeatIntervalMinutes: Number(value) || 30 })
            }
          />
          <Text style={styles.unit}>min</Text>
        </View>
      </FieldRow>
      <FieldRow label="翻译目标语言" hint="点击翻译时，自动识别原文语言并翻译成另一种目标语言">
        <View style={styles.inlineRow}>
          <View style={styles.flex}>
            <ChoiceList
              value={draft.translationLanguages[0]}
              options={AGENT_TRANSLATION_LANGS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(id) => updateDraft({ translationLanguages: [id, draft.translationLanguages[1]] })}
            />
          </View>
          <Text style={styles.unit}>↔</Text>
          <View style={styles.flex}>
            <ChoiceList
              value={draft.translationLanguages[1]}
              options={AGENT_TRANSLATION_LANGS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(id) => updateDraft({ translationLanguages: [draft.translationLanguages[0], id] })}
            />
          </View>
        </View>
      </FieldRow>
      <ToggleRow
        label="默认启用联网搜索"
        value={draft.defaultWebSearch}
        onChange={(defaultWebSearch) => updateDraft({ defaultWebSearch })}
      />
      <ToggleRow
        label="默认启用知识库"
        value={draft.defaultKb}
        onChange={(defaultKb) => updateDraft({ defaultKb })}
      />
      <ToggleRow
        label="优先经桌面宿主调用"
        value={draft.preferDesktopHost}
        onChange={(preferDesktopHost) => updateDraft({ preferDesktopHost })}
      />
      <FieldRow label="描述">
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={draft.description}
          onChangeText={(description) => updateDraft({ description })}
          placeholder="可选"
          placeholderTextColor={colors.textSecondary}
          textAlignVertical="top"
        />
      </FieldRow>
    </View>
  )
}
