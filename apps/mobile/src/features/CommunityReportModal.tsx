import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../theme'
import {
  createCommunityModerationReport,
  resolveReportTarget,
  type CommunityListItem,
  type CommunityReportReason,
} from './communityHubClient'
import { CommunityFormModal } from './CommunityFormModal'
import { communityPublishModalStyles as formStyles } from './communityPublishModalStyles'

const REPORT_REASONS: Array<{ id: CommunityReportReason; label: string }> = [
  { id: 'spam', label: '垃圾信息' },
  { id: 'illegal', label: '违法违规' },
  { id: 'copyright', label: '侵权内容' },
  { id: 'other', label: '其他' },
]

export function CommunityReportModal(props: {
  visible: boolean
  item: CommunityListItem | null
  listKind: string
  hubBaseUrl: string
  userId: string | null
  onClose: () => void
}) {
  const { visible, item, listKind, hubBaseUrl, userId, onClose } = props
  const [reason, setReason] = useState<CommunityReportReason>('spam')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const target = item ? resolveReportTarget(listKind, item.id) : null

  const handleClose = () => {
    setReason('spam')
    setDescription('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  const submit = async () => {
    if (!target || !item) return
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityModerationReport(
        hubBaseUrl,
        {
          targetType: target.targetType,
          targetId: target.targetId,
          reason,
          description: description.trim() || undefined,
        },
        userId,
      )
      setSuccess(true)
      globalThis.setTimeout(handleClose, 900)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交举报失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunityFormModal
      visible={visible}
      title="举报"
      confirmLabel={success ? '已提交' : '提交举报'}
      submitting={submitting}
      confirmDisabled={success || !target}
      error={error}
      onClose={handleClose}
      onConfirm={() => void submit()}
    >
      {success ? <Text style={formStyles.hint}>举报已提交，感谢反馈。</Text> : null}
      <Text style={formStyles.label}>原因</Text>
      <View style={formStyles.chipRow}>
        {REPORT_REASONS.map((entry) => {
          const active = reason === entry.id
          return (
            <Pressable
              key={entry.id}
              disabled={submitting || success}
              onPress={() => setReason(entry.id)}
              style={[formStyles.chip, active ? formStyles.chipActive : null]}
            >
              <Text style={[formStyles.chipText, active ? formStyles.chipTextActive : null]}>
                {entry.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={formStyles.label}>补充说明（可选）</Text>
      <TextInput
        style={[formStyles.input, formStyles.textarea]}
        value={description}
        onChangeText={setDescription}
        editable={!submitting && !success}
        multiline
        placeholder="补充举报说明"
        placeholderTextColor={colors.textSecondary}
      />
      {submitting ? <ActivityIndicator color={colors.accent} /> : null}
    </CommunityFormModal>
  )
}
