import { Text, TextInput } from 'react-native'
import { colors } from '../theme'
import type { CommunityResourceType } from './communityHubClient'
import { CommunityFormModal } from './CommunityFormModal'
import { communityPublishModalStyles as styles } from './communityPublishModalStyles'
import {
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
