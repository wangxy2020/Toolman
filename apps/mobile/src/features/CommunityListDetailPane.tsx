import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { colors } from '../theme'
import {
  fetchCommunityNewsArticle,
  type CommunityListItem,
} from './communityHubClient'
import { CommunityListCard } from './communityPanelUi.cards'
import { formatCommunityCount, resolveCommunityItemBody } from './communityListFormat'
import { communityPaneStyles as styles } from './CommunityPanes.styles'

function mergeEngagement(prev: CommunityListItem, next: CommunityListItem): CommunityListItem {
  if (
    prev.likeCount === next.likeCount &&
    prev.dislikeCount === next.dislikeCount &&
    prev.favoriteCount === next.favoriteCount &&
    prev.commentCount === next.commentCount &&
    prev.likedByMe === next.likedByMe &&
    prev.dislikedByMe === next.dislikedByMe &&
    prev.favoritedByMe === next.favoritedByMe
  ) {
    return prev
  }
  return {
    ...prev,
    likeCount: next.likeCount,
    dislikeCount: next.dislikeCount,
    favoriteCount: next.favoriteCount,
    commentCount: next.commentCount,
    likedByMe: next.likedByMe,
    dislikedByMe: next.dislikedByMe,
    favoritedByMe: next.favoritedByMe,
  }
}

export function CommunityListDetailPane(props: {
  item: CommunityListItem
  listKind: string
  hubBaseUrl: string
  userId: string | null
  guestBlocked?: boolean
  onBack: () => void
  onPatchItem?: (id: string, patch: Partial<CommunityListItem>) => void
  onOpenComments?: () => void
  onOpenReport?: () => void
  commentsExpanded?: boolean
  busyAction?: 'like' | 'dislike' | 'favorite' | null
  onLike?: () => void
  onDislike?: () => void
  onFavorite?: () => void
  onShare?: () => void
}) {
  const {
    item,
    listKind,
    hubBaseUrl,
    userId,
    onBack,
    onPatchItem,
    onOpenComments,
    onOpenReport,
    commentsExpanded,
    busyAction,
    onLike,
    onDislike,
    onFavorite,
    onShare,
  } = props
  const [detail, setDetail] = useState<CommunityListItem>(item)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onPatchItemRef = useRef(onPatchItem)
  onPatchItemRef.current = onPatchItem
  const fetchedIdRef = useRef<string | null>(null)

  // Reset local detail only when navigating to a different list item.
  useEffect(() => {
    setDetail(item)
    setError(null)
    setRefreshing(false)
    fetchedIdRef.current = null
  }, [item.id])

  // Keep engagement counts in sync when parent patches after like/comment.
  useEffect(() => {
    setDetail((prev) => (prev.id === item.id ? mergeEngagement(prev, item) : prev))
  }, [
    item.id,
    item.likeCount,
    item.dislikeCount,
    item.favoriteCount,
    item.commentCount,
    item.likedByMe,
    item.dislikedByMe,
    item.favoritedByMe,
  ])

  useEffect(() => {
    if (listKind !== 'news' || !hubBaseUrl) return
    if (fetchedIdRef.current === item.id) return
    fetchedIdRef.current = item.id

    let cancelled = false
    setRefreshing(true)
    setError(null)
    void fetchCommunityNewsArticle(hubBaseUrl, item.id, userId)
      .then((next) => {
        if (cancelled) return
        setDetail((prev) => ({
          ...prev,
          ...next,
          // Prefer already-visible list title/meta if fetch briefly lags.
          title: next.title || prev.title,
        }))
        onPatchItemRef.current?.(item.id, {
          likeCount: next.likeCount,
          dislikeCount: next.dislikeCount,
          favoriteCount: next.favoriteCount,
          commentCount: next.commentCount,
          likedByMe: next.likedByMe,
          dislikedByMe: next.dislikedByMe,
          favoritedByMe: next.favoritedByMe,
          contentHtml: next.contentHtml,
          summary: next.summary,
          body: next.body,
          link: next.link,
          coverUrl: next.coverUrl,
        })
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载详情失败')
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [hubBaseUrl, item.id, listKind, userId])

  const body = resolveCommunityItemBody(detail)
  const heading =
    listKind === 'news' ? '资讯详情' : listKind === 'messages' ? '留言详情' : '内容详情'

  const openLink = () => {
    const link = detail.link?.trim()
    if (!link) return
    void Linking.openURL(link).catch(() => undefined)
  }

  return (
    <View style={styles.panelRoot}>
      <View style={styles.detailHeader}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.detailBackBtn, pressed ? styles.detailBackBtnPressed : null]}
          accessibilityLabel="返回列表"
        >
          <Text style={styles.detailBackText}>← 返回</Text>
        </Pressable>
        <Text style={styles.detailHeaderTitle} numberOfLines={1}>
          {heading}
        </Text>
      </View>

      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.detailScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.detailTitle}>{detail.title}</Text>
        {detail.meta ? <Text style={styles.detailMeta}>{detail.meta}</Text> : null}

        <View style={styles.detailStats}>
          <Text style={styles.detailStat}>赞 {formatCommunityCount(detail.likeCount)}</Text>
          <Text style={styles.detailStat}>收藏 {formatCommunityCount(detail.favoriteCount)}</Text>
          <Text style={styles.detailStat}>评论 {formatCommunityCount(detail.commentCount)}</Text>
        </View>

        {error ? <Text style={styles.detailError}>{error}</Text> : null}

        {detail.coverUrl ? (
          <Image
            source={{ uri: detail.coverUrl }}
            style={styles.detailCover}
            resizeMode="cover"
            accessibilityLabel="封面"
          />
        ) : null}
        <Text style={styles.detailBody}>{body || '暂无正文'}</Text>
        {refreshing ? (
          <View style={styles.detailLoadingInline}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingText}>正在更新全文…</Text>
          </View>
        ) : null}

        {detail.link ? (
          <Pressable
            onPress={openLink}
            style={({ pressed }) => [
              styles.detailLinkBtn,
              pressed ? styles.detailLinkBtnPressed : null,
            ]}
          >
            <Text style={styles.detailLinkText}>查看原文</Text>
          </Pressable>
        ) : null}

        <View style={styles.detailActionsWrap}>
          <CommunityListCard
            item={detail}
            showInstall={false}
            actionsOnly
            actions={{
              busyAction,
              commentsExpanded,
              onLike,
              onDislike,
              onFavorite,
              onComment: onOpenComments,
              onShare,
              onReport: onOpenReport,
            }}
          />
        </View>
      </ScrollView>
    </View>
  )
}
