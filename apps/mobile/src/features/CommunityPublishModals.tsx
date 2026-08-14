import { useEffect, useState, type ReactNode } from 'react'
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
import {
  createCommunityBoardMessage,
  createCommunityNewsSource,
  createCommunityResource,
  createCommunityTask,
  deleteCommunityNewsSource,
  fetchCommunityNewsSource,
  listCommunityNewsSources,
  publishCommunityTask,
  type CommunityNewsSource,
  type CommunityResourceType,
  type CommunityTaskType,
} from './communityHubClient'

function buildMessageBody(title: string, body: string): string {
  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  if (!trimmedTitle) return trimmedBody
  if (!trimmedBody) return trimmedTitle
  return `${trimmedTitle}\n\n${trimmedBody}`
}

function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const TASK_TYPES: Array<{ id: CommunityTaskType; label: string }> = [
  { id: 'development', label: '开发' },
  { id: 'design', label: '设计' },
  { id: 'translation', label: '翻译' },
  { id: 'tender', label: '招标' },
  { id: 'other', label: '其他' },
]

const RESOURCE_LABEL: Record<CommunityResourceType, string> = {
  knowledge: '知识库',
  mcp: 'MCP',
  skill: 'Skill',
  workflow: '工作流',
}

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

type SharedPublishProps = {
  visible: boolean
  hubBaseUrl: string
  userId?: string | null
  onClose: () => void
  onPublished: () => void
  embedded?: boolean
}

export function CommunityMessagePublishModal(props: SharedPublishProps) {
  const { visible, hubBaseUrl, userId, onClose, onPublished } = props
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setBody('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    const messageBody = buildMessageBody(title, body)
    if (!messageBody) {
      setError('请填写留言内容')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityBoardMessage(hubBaseUrl, { body: messageBody }, userId)
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布留言失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunityFormModal
      visible={visible}
      title="发布留言"
      confirmLabel="发布"
      submitting={submitting}
      confirmDisabled={!title.trim() && !body.trim()}
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
        onChangeText={(value) => {
          setTitle(value)
          setError(null)
        }}
        placeholder="一句话概括"
        placeholderTextColor={colors.textSecondary}
      />
      <Text style={styles.label}>
        内容<Text style={styles.required}> *</Text>
      </Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={body}
        onChangeText={(value) => {
          setBody(value)
          setError(null)
        }}
        placeholder="想对社区说的话…"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
    </CommunityFormModal>
  )
}

export function CommunityTaskPublishModal(props: SharedPublishProps) {
  const { visible, hubBaseUrl, userId, onClose, onPublished } = props
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<CommunityTaskType>('development')
  const [budgetAmount, setBudgetAmount] = useState('0')
  const [budgetCurrency, setBudgetCurrency] = useState('CNY')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setDescription('')
    setTaskType('development')
    setBudgetAmount('0')
    setBudgetCurrency('CNY')
    setTags('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写任务标题')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createCommunityTask(
        hubBaseUrl,
        {
          title: title.trim(),
          description: description.trim(),
          taskType,
          budgetAmount: Number(budgetAmount) || 0,
          budgetCurrency: budgetCurrency.trim() || 'CNY',
          tags: parseTags(tags),
        },
        userId,
      )
      await publishCommunityTask(hubBaseUrl, created.id, userId)
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布任务失败')
    } finally {
      setSubmitting(false)
    }
  }

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
        onChangeText={(value) => {
          setTitle(value)
          setError(null)
        }}
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
        {TASK_TYPES.map((item) => {
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
  const { visible, hubBaseUrl, userId, resourceType, onClose, onPublished } = props
  const label = RESOURCE_LABEL[resourceType]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [license, setLicense] = useState('MIT')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setDescription('')
    setLicense('MIT')
    setTags('')
    setError(null)
    setSubmitting(false)
  }, [visible])

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(`请填写${label}标题`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityResource(
        hubBaseUrl,
        {
          title: title.trim(),
          description: description.trim(),
          resourceType,
          license: license.trim() || 'MIT',
          tags: parseTags(tags),
        },
        userId,
      )
      onPublished()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : `发布${label}失败`)
    } finally {
      setSubmitting(false)
    }
  }

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
        onChangeText={(value) => {
          setTitle(value)
          setError(null)
        }}
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
  const { visible, hubBaseUrl, userId, onClose, onPublished, embedded = false } = props
  const [sources, setSources] = useState<CommunityNewsSource[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      setSources(await listCommunityNewsSources(hubBaseUrl, userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 RSS 源失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    setTitle('')
    setFeedUrl('')
    setError(null)
    void reload()
  }, [visible, hubBaseUrl, userId])

  const handleAdd = async () => {
    const url = feedUrl.trim()
    if (!url) {
      setError('请填写 Feed URL')
      return
    }
    const derivedTitle =
      title.trim() ||
      (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, '')
        } catch {
          return 'RSS 订阅'
        }
      })()
    setSubmitting(true)
    setError(null)
    try {
      const source = await createCommunityNewsSource(
        hubBaseUrl,
        { title: derivedTitle, feedUrl: url },
        userId,
      )
      if (source.id) {
        try {
          await fetchCommunityNewsSource(hubBaseUrl, source.id, userId)
        } catch {
          // Source created; fetch can be retried from the list.
        }
      }
      setTitle('')
      setFeedUrl('')
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加 RSS 源失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFetch = async (sourceId: string) => {
    setError(null)
    try {
      await fetchCommunityNewsSource(hubBaseUrl, sourceId, userId)
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取失败')
    }
  }

  const handleDelete = async (sourceId: string) => {
    setError(null)
    try {
      await deleteCommunityNewsSource(hubBaseUrl, sourceId, userId)
      await reload()
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

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
        onChangeText={(value) => {
          setFeedUrl(value)
          setError(null)
        }}
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
