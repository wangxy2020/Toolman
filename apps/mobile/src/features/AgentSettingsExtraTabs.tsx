import { Pressable, Text, TextInput, View } from 'react-native'
import { BUILTIN_SKILLS } from '@toolman/shared'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import { ToggleRow } from './agentSettingsFields'
import { agentSettingsModalStyles as styles } from './agentSettingsModalStyles'
import {
  AGENT_MCP_CATALOG,
  AGENT_PERMISSION_MODES,
  clampAgentTemperature,
  toggleIdList,
  type AgentSettingsDraft,
  type AgentSettingsTab,
} from './useAgentSettingsModal'

export function AgentSettingsExtraTabs(props: {
  tab: Exclude<AgentSettingsTab, 'basic'>
  draft: AgentSettingsDraft
  updateDraft: (patch: Partial<AgentSettingsDraft>) => void
}) {
  const { tab, draft, updateDraft } = props
  const { knowledgeMeta } = useMobileApp()

  if (tab === 'prompt') {
    return (
      <View style={styles.form}>
        <Text style={styles.label}>系统提示词</Text>
        <TextInput
          style={[styles.input, styles.textarea, styles.textareaTall]}
          multiline
          value={draft.systemPrompt}
          onChangeText={(systemPrompt) => updateDraft({ systemPrompt })}
          textAlignVertical="top"
        />
      </View>
    )
  }

  if (tab === 'permission') {
    const effective = AGENT_PERMISSION_MODES.find((item) => item.id === draft.permissionMode)?.title
    return (
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>权限模式</Text>
        <Text style={styles.hint}>当前生效：{effective}</Text>
        <View style={styles.permGrid}>
          {AGENT_PERMISSION_MODES.map((mode) => {
            const selected = draft.permissionMode === mode.id
            return (
              <Pressable
                key={mode.id}
                onPress={() => updateDraft({ permissionMode: mode.id })}
                style={[styles.permCard, selected ? styles.permCardActive : null]}
              >
                {selected ? <Text style={styles.permCheck}>✓</Text> : null}
                <Text style={styles.permTitle}>{mode.title}</Text>
                <Text style={styles.permDesc}>{mode.description}</Text>
                {mode.warning ? <Text style={styles.permWarn}>⚠ {mode.warning}</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </View>
    )
  }

  if (tab === 'tools') {
    return (
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>预授权工具</Text>
        <ToggleRow
          label="Bash"
          hint="在环境中执行 Shell 命令。禁用时需要人工审批。"
          value={draft.bashEnabled}
          onChange={(bashEnabled) => updateDraft({ bashEnabled })}
        />
        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>MCP 服务器</Text>
        <Text style={styles.hint}>移动端可保存挂载选择；实际连接由桌面端运行。</Text>
        {AGENT_MCP_CATALOG.map((server) => (
          <ToggleRow
            key={server.id}
            label={server.name}
            hint={server.description}
            value={draft.mcpServerIds.includes(server.id)}
            onChange={(enabled) =>
              updateDraft({
                mcpServerIds: toggleIdList(draft.mcpServerIds, server.id, enabled),
              })
            }
          />
        ))}
      </View>
    )
  }

  if (tab === 'skills') {
    return (
      <View style={styles.form}>
        <Text style={styles.hint}>已安装的技能可按需挂载；运行时会把技能说明注入系统提示。</Text>
        {BUILTIN_SKILLS.map((skill) => (
          <ToggleRow
            key={skill.id}
            label={skill.name}
            hint={skill.description}
            value={draft.skillIds.includes(skill.id)}
            onChange={(enabled) =>
              updateDraft({
                skillIds: toggleIdList(draft.skillIds, skill.id, enabled),
              })
            }
          />
        ))}
      </View>
    )
  }

  if (tab === 'knowledge') {
    return (
      <View style={styles.form}>
        <Text style={styles.hint}>选择对话时可检索的知识库。</Text>
        {knowledgeMeta.length === 0 ? (
          <Text style={styles.hint}>暂无已同步的知识库。可在知识库页从桌面同步。</Text>
        ) : (
          knowledgeMeta.map((item) => (
            <ToggleRow
              key={item.id}
              label={item.name}
              hint={`${item.documentCount} 篇文档`}
              value={draft.kbIds.includes(item.id)}
              onChange={(enabled) =>
                updateDraft({
                  kbIds: toggleIdList(draft.kbIds, item.id, enabled),
                  defaultKb: enabled ? true : draft.defaultKb,
                })
              }
            />
          ))
        )}
      </View>
    )
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>温度 (Temperature)</Text>
      <Text style={styles.hint}>越高越有创造性，越低越稳定；范围 0–2</Text>
      <View style={styles.inlineRow}>
        <TextInput
          style={[styles.input, styles.inlineInput]}
          keyboardType="decimal-pad"
          value={String(draft.temperature)}
          onChangeText={(value) => {
            updateDraft({ temperature: clampAgentTemperature(value) })
          }}
        />
        <Text style={styles.unit}>{draft.temperature.toFixed(1)}</Text>
      </View>
      <Text style={styles.label}>最大输出 Token</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="默认"
        placeholderTextColor={colors.textSecondary}
        value={draft.maxTokens}
        onChangeText={(maxTokens) => updateDraft({ maxTokens })}
      />
      <Text style={styles.label}>会话轮次上限</Text>
      <Text style={styles.hint}>数值越高可自主运行越久；数值越低更易控制。</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={String(draft.sessionRoundLimit)}
        onChangeText={(value) => updateDraft({ sessionRoundLimit: Number(value) || 100 })}
      />
      <Text style={styles.label}>环境变量</Text>
      <Text style={styles.hint}>每行一个，格式：KEY=value</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        multiline
        value={draft.environmentVariables}
        onChangeText={(environmentVariables) => updateDraft({ environmentVariables })}
        placeholder={'KEY=value\nANOTHER_KEY=value'}
        placeholderTextColor={colors.textSecondary}
        textAlignVertical="top"
      />
    </View>
  )
}
