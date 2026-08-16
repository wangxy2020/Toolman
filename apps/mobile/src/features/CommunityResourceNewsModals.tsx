import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import type { CommunityResourceType } from './communityHubClient'
import { CommunityFormModal } from './CommunityFormModal'
import { communityPublishModalStyles as styles } from './communityPublishModalStyles'
import {
  useCommunityNewsSources,
  useCommunityResourcePublish,
  type SharedPublishProps,
} from './useCommunityPublishModals'

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
