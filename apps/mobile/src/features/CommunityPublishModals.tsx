import { type ReactNode } from 'react'
import {
  ActivityIndicator,
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
import { colors } from '../theme'
import type { CommunityResourceType } from './communityHubClient'
import { COMMUNITY_TASK_TYPES } from './communityPublishValidators'
import {
  useCommunityMessagePublish,
  useCommunityNewsSources,
  useCommunityResourcePublish,
  useCommunityTaskPublish,
  type SharedPublishProps,
} from './useCommunityPublishModals'

type FormModalProps = {
  visible: boolean
  title: string
  confirmLabel: string
  submitting?: boolean
  confirmDisabled?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}

function CommunityFormModal(props: FormModalProps) {
  const {
    visible,
    title,
    confirmLabel,
    submitting = false,
    confirmDisabled = false,
    error,
    onClose,
    onConfirm,
    children,
  } = props

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.titleDot} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {children}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnSecondary,
                pressed ? styles.footerBtnPressed : null,
              ]}
            >
              <Text style={styles.footerBtnSecondaryText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={submitting || confirmDisabled}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnPrimary,
                submitting || confirmDisabled ? styles.footerBtnDisabled : null,
                pressed ? styles.footerBtnPressed : null,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.footerBtnPrimaryText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

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

export function CommunityResourcePublishModal(
  props: SharedPublishProps & { resourceType: CommunityResourceType },
) {
  const { visible, onClose } = props
  const {
    label,
    title,
    setTitle,
    description,
    setDescription,
    license,
    setLicense,
    tags,
    setTags,
    submitting,
    error,
    handleSubmit,
  } = useCommunityResourcePublish(props)

  return (
    <CommunityFormModal
      visible={visible}
      title={`发布${label}`}
      confirmLabel="提交"
      submitting={submitting}
      error={error}
      onClose={onClose}
      onConfirm={() => void handleSubmit()}
    >
      <Text style={styles.hint}>
        移动端可先创建草稿。完整上架（上传资源包）请使用桌面端。
      </Text>
      <Text style={styles.label}>
        标题<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={`例如：社区${label}示例`}
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>简介</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="简要说明用途与安装方式"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
      <Text style={styles.label}>许可证</Text>
      <TextInput
        style={styles.input}
        value={license}
        onChangeText={setLicense}
        placeholder="MIT"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>标签</Text>
      <TextInput
        style={styles.input}
        value={tags}
        onChangeText={setTags}
        placeholder="用逗号分隔"
        placeholderTextColor={colors.textSecondary}
      />
    </CommunityFormModal>
  )
}

export function CommunityNewsSourcesModal(props: SharedPublishProps) {
  const { visible, onClose, embedded = false } = props
  const {
    sources,
    loading,
    title,
    setTitle,
    feedUrl,
    setFeedUrl,
    submitting,
    error,
    handleAdd,
    handleFetch,
    handleDelete,
  } = useCommunityNewsSources(props)

  const form = (
    <>
      <Text style={styles.hint}>添加 RSS 后会拉取文章到资讯列表。添加源需要登录。</Text>
      <Text style={styles.label}>源名称</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="可选，留空则使用域名"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>
        Feed URL<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={feedUrl}
        onChangeText={setFeedUrl}
        placeholder="https://…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {embedded ? (
        <Pressable
          onPress={() => void handleAdd()}
          disabled={submitting}
          style={[styles.sourceBtn, submitting ? styles.footerBtnDisabled : null]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.sourceBtnText}>添加并拉取</Text>
          )}
        </Pressable>
      ) : null}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>已添加的源</Text>
        {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>
      {sources.length === 0 && !loading ? (
        <Text style={styles.hint}>暂无 RSS 源</Text>
      ) : (
        sources.map((source) => (
          <View key={source.id} style={styles.sourceCard}>
            <Text style={styles.sourceTitle}>{source.title}</Text>
            <Text style={styles.sourceUrl} numberOfLines={1}>
              {source.feedUrl}
            </Text>
            {source.lastError ? <Text style={styles.error}>{source.lastError}</Text> : null}
            <View style={styles.sourceActions}>
              <Pressable onPress={() => void handleFetch(source.id)} style={styles.sourceBtn}>
                <Text style={styles.sourceBtnText}>拉取</Text>
              </Pressable>
              <Pressable onPress={() => void handleDelete(source.id)} style={styles.sourceBtn}>
                <Text style={[styles.sourceBtnText, styles.sourceBtnDanger]}>删除</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </>
  )

  if (embedded) {
    return (
      <View style={{ gap: 8 }}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {form}
      </View>
    )
  }

  return (
    <CommunityFormModal
      visible={visible}
      title="RSS 源"
      confirmLabel="添加并拉取"
      submitting={submitting}
      error={error}
      onClose={onClose}
      onConfirm={() => void handleAdd()}
    >
      {form}
    </CommunityFormModal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 18,
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
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  titleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: {
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
    maxHeight: 420,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  required: {
    color: colors.danger,
  },
  optional: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  textarea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  listHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sourceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    backgroundColor: colors.surface,
  },
  sourceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sourceUrl: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sourceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  sourceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.hover,
  },
  sourceBtnText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '500',
  },
  sourceBtnDanger: {
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerBtn: {
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: {
    backgroundColor: colors.hover,
  },
  footerBtnPrimary: {
    backgroundColor: colors.accent,
  },
  footerBtnPressed: {
    opacity: 0.88,
  },
  footerBtnDisabled: {
    opacity: 0.55,
  },
  footerBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  footerBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
