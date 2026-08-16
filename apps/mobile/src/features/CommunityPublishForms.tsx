import { Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import { COMMUNITY_TASK_TYPES } from './communityPublishValidators'
import { CommunityFormModal } from './CommunityFormModal'
import { communityPublishModalStyles as styles } from './communityPublishModalStyles'
import {
  useCommunityMessagePublish,
  useCommunityTaskPublish,
  type SharedPublishProps,
} from './useCommunityPublishModals'

export function CommunityMessagePublishModal(props: SharedPublishProps) {
  const { visible, onClose } = props
  const {
    title,
    setTitle,
    body,
    setBody,
    submitting,
    error,
    confirmDisabled,
    handleSubmit,
  } = useCommunityMessagePublish(props)

  return (
    <CommunityFormModal
      visible={visible}
      title="发布留言"
      confirmLabel="发布"
      submitting={submitting}
      confirmDisabled={confirmDisabled}
      error={error}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
    >
      <Text style={styles.label}>
        标题 <Text style={styles.optional}>可选</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="一句话概括"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>
        内容<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={body}
        onChangeText={setBody}
        placeholder="想对社区说的话…"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
    </CommunityFormModal>
  )
}

export function CommunityTaskPublishModal(props: SharedPublishProps) {
  const { visible, onClose } = props
  const {
    title,
    setTitle,
    description,
    setDescription,
    taskType,
    setTaskType,
    budgetAmount,
    setBudgetAmount,
    budgetCurrency,
    setBudgetCurrency,
    tags,
    setTags,
    submitting,
    error,
    handleSubmit,
  } = useCommunityTaskPublish(props)

  return (
    <CommunityFormModal
      visible={visible}
      title="发布任务"
      confirmLabel="发布任务"
      submitting={submitting}
      error={error}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
    >
      <Text style={styles.label}>
        任务标题<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="例如：开发 Toolman MCP 插件"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>任务描述</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="说明任务目标、交付要求与验收标准…"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
      <Text style={styles.label}>任务类型</Text>
      <View style={styles.chipRow}>
        {COMMUNITY_TASK_TYPES.map((item) => {
          const active = taskType === item.id
          return (
            <Pressable
              key={item.id}
              onPress={() => setTaskType(item.id)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item.label}</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={styles.label}>预算</Text>
      <TextInput
        style={styles.input}
        value={budgetAmount}
        onChangeText={setBudgetAmount}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>币种</Text>
      <TextInput
        style={styles.input}
        value={budgetCurrency}
        onChangeText={setBudgetCurrency}
        placeholder="CNY"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="characters"
      />
      <Text style={styles.label}>标签</Text>
      <TextInput
        style={styles.input}
        value={tags}
        onChangeText={setTags}
        placeholder="用逗号分隔，例如：rust, electron"
        placeholderTextColor={colors.textSecondary}
      />
    </CommunityFormModal>
  )
}
