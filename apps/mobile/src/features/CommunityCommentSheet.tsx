import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors } from '../theme'
import {
  createCommunityComment,
  deleteCommunityComment,
  listCommunityComments,
  resolveCommentTarget,
  type CommunityCommentItem,
  type CommunityListItem,
} from './communityHubClient'
import { formatCommunityDate } from './communityListFormat'
import { notifyLoginRequired } from './communityPaneUtils'
import { communityInteractionStyles as styles } from './communityInteractionStyles'

export function CommunityCommentSheet(props: {
  visible: boolean
  item: CommunityListItem | null
  listKind: string
  hubBaseUrl: string
  userId: string | null
  onClose: () => void
  onCountChange?: (itemId: string, count: number) => void
}) {
  const { visible, item, listKind, hubBaseUrl, userId, onClose, onCountChange } = props
  const [items, setItems] = useState<CommunityCommentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const onCountChangeRef = useRef(onCountChange)
  onCountChangeRef.current = onCountChange
  const loadedKeyRef = useRef<string | null>(null)

  const target = item ? resolveCommentTarget(listKind, item.id) : null
  const targetKey = target
    ? `${target.targetType}:${target.targetId}:${target.parentId ?? ''}`
    : null
  const itemId = item?.id ?? null

  useEffect(() => {
    if (!visible) {
      setDraft('')
      setError(null)
      loadedKeyRef.current = null
      return
    }
    if (!itemId || !hubBaseUrl || !targetKey) return
    const current = resolveCommentTarget(listKind, itemId)
    if (!current) return

    // Avoid refetch loops when parent re-renders with a new item object.
    if (loadedKeyRef.current === targetKey) return
    loadedKeyRef.current = targetKey

    let cancelled = false
    setLoading(true)
    setError(null)
    void listCommunityComments(hubBaseUrl, current, userId)
      .then((next) => {
        if (cancelled) return
        setItems(next)
        onCountChangeRef.current?.(itemId, next.length)
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : '加载评论失败')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hubBaseUrl, itemId, listKind, targetKey, userId, visible])

  const submit = async () => {
    if (!target || !item) return
    const body = draft.trim()
    if (!body) return
    if (!userId) {
      notifyLoginRequired()
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createCommunityComment(hubBaseUrl, target, body, userId)
      const next = [...items, created]
      setItems(next)
      setDraft('')
      onCountChangeRef.current?.(item.id, next.length)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '发表评论失败')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async (commentId: string) => {
    if (!userId || !item) return
    setDeletingId(commentId)
    setError(null)
    try {
      await deleteCommunityComment(hubBaseUrl, commentId, userId)
      const next = items.filter((entry) => entry.id !== commentId)
      setItems(next)
      onCountChangeRef.current?.(item.id, next.length)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除评论失败')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="关闭评论" />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>评论</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="关闭">
              <Text style={styles.sheetClose}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {error ? <Text style={styles.sheetError}>{error}</Text> : null}
            {loading && items.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.sheetEmptyText}>加载评论…</Text>
              </View>
            ) : items.length === 0 ? (
              <Text style={styles.sheetEmptyText}>暂无评论，来写第一条吧</Text>
            ) : (
              items.map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <View style={styles.commentHead}>
                    <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                    <View style={styles.commentHeadActions}>
                      <Text style={styles.commentTime}>
                        {formatCommunityDate(comment.createdAt)}
                      </Text>
                      {userId && comment.userId === userId ? (
                        <Pressable
                          disabled={deletingId === comment.id}
                          onPress={() => void remove(comment.id)}
                          hitSlop={6}
                        >
                          <Text style={styles.commentDelete}>
                            {deletingId === comment.id ? '…' : '删除'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder={userId ? '写下你的评论…' : '登录后即可评论'}
              placeholderTextColor={colors.textSecondary}
              editable={Boolean(userId) && !submitting}
              multiline
            />
            <Pressable
              onPress={() => void submit()}
              disabled={!userId || submitting || !draft.trim()}
              style={({ pressed }) => [
                styles.composerSubmit,
                (!userId || submitting || !draft.trim()) && styles.composerSubmitDisabled,
                pressed ? styles.composerSubmitPressed : null,
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.composerSubmitText}>发送</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
