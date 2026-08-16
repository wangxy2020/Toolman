import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useCallback } from 'react'
import { colors } from '../theme'
import {
  CommunityMessagePublishModal,
  CommunityNewsSourcesModal,
  CommunityResourcePublishModal,
  CommunityTaskPublishModal,
} from './CommunityPublishModals'
import { CommunityCommentSheet } from './CommunityCommentSheet'
import { CommunityReportModal } from './CommunityReportModal'
import { MODERATION_CATEGORIES } from './communitySidebar'
import {
  CommunityCategoryChips,
  CommunityEmptyState,
  CommunityListCard,
  CommunityPanelHeader,
  CommunityPublishButton,
  CommunityRefreshButton,
  CommunitySecondaryButton,
  CommunityStatGrid,
} from './communityPanelUi'
import { CommunityListDetailPane } from './CommunityListDetailPane'
import { comingSoon } from './communityPaneUtils'
import { communityPaneStyles as styles } from './CommunityPanes.styles'
import {
  useCommunityListSection,
  useCommunityManagementPanel,
  useCommunityMinePanel,
  type CommunityListSectionId,
} from './useCommunityPanes'

function itemBusyAction(
  busyId: string | null,
  itemId: string,
): 'like' | 'dislike' | 'favorite' | null {
  if (!busyId || !busyId.startsWith(`${itemId}:`)) return null
  const kind = busyId.slice(itemId.length + 1)
  if (kind === 'like' || kind === 'dislike' || kind === 'favorite') return kind
  return null
}

export function CommunityListSectionPanel({
  sectionId,
}: {
  sectionId: CommunityListSectionId
}) {
  const {
    section,
    sorted,
    loading,
    offline,
    reload,
    hubBaseUrl,
    userId,
    selectedId,
    setSelectedId,
    publishOpen,
    setPublishOpen,
    rssOpen,
    setRssOpen,
    openPublish,
    openRss,
    resourceType,
    interactions,
    commentItem,
    reportItem,
    patchItem,
    listKind,
    guestBlocked,
  } = useCommunityListSection(sectionId)

  const detailItem = selectedId
    ? sorted.find((item) => item.id === selectedId) ?? null
    : null

  const handleCommentCountChange = useCallback(
    (id: string, count: number) => {
      patchItem(id, { commentCount: count })
    },
    [patchItem],
  )

  const interactionModals = (
    <>
      <CommunityCommentSheet
        visible={Boolean(commentItem)}
        item={commentItem}
        listKind={listKind}
        hubBaseUrl={hubBaseUrl}
        userId={userId}
        onClose={() => interactions.setCommentItemId(null)}
        onCountChange={handleCommentCountChange}
      />
      <CommunityReportModal
        visible={Boolean(reportItem)}
        item={reportItem}
        listKind={listKind}
        hubBaseUrl={hubBaseUrl}
        userId={userId}
        onClose={() => interactions.setReportItemId(null)}
      />
    </>
  )

  if (detailItem) {
    return (
      <>
        <CommunityListDetailPane
          item={detailItem}
          listKind={listKind}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          guestBlocked={guestBlocked}
          onBack={() => setSelectedId(null)}
          onPatchItem={patchItem}
          onOpenComments={() => interactions.openComments(detailItem)}
          onOpenReport={() => interactions.openReport(detailItem)}
          commentsExpanded={interactions.commentItemId === detailItem.id}
          busyAction={itemBusyAction(interactions.busyId, detailItem.id)}
          onLike={() => void interactions.runInteraction(detailItem, 'like')}
          onDislike={() => void interactions.runInteraction(detailItem, 'dislike')}
          onFavorite={() => void interactions.runInteraction(detailItem, 'favorite')}
          onShare={() => void interactions.shareItem(detailItem)}
        />
        {interactionModals}
      </>
    )
  }

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={
          <>
            {section.showPublish !== false && section.publishLabel ? (
              <CommunityPublishButton
                label={section.publishLabel}
                disabled={offline}
                onPress={openPublish}
              />
            ) : null}
            {section.showRss ? (
              <CommunitySecondaryButton
                label="RSS 源"
                disabled={offline}
                onPress={openRss}
              />
            ) : null}
            <CommunityRefreshButton loading={loading} onPress={reload} />
          </>
        }
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <Text style={styles.readonlyHint}>
          未登录也可浏览全部资讯与留言。登录后可点赞、评论、收藏、转发与举报；发布需登录。
        </Text>
        {loading && sorted.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>加载中…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <CommunityEmptyState hint={section.emptyHint} />
        ) : (
          sorted.map((item) => (
            <CommunityListCard
              key={item.id}
              item={item}
              selected={false}
              showInstall={section.showInstall}
              onPress={() => setSelectedId(item.id)}
              actions={{
                busyAction: itemBusyAction(interactions.busyId, item.id),
                commentsExpanded: interactions.commentItemId === item.id,
                onLike: () => void interactions.runInteraction(item, 'like'),
                onDislike: () => void interactions.runInteraction(item, 'dislike'),
                onFavorite: () => void interactions.runInteraction(item, 'favorite'),
                onComment: () => interactions.openComments(item),
                onShare: () => void interactions.shareItem(item),
                onReport: () => interactions.openReport(item),
              }}
            />
          ))
        )}
      </ScrollView>
      {section.listKind === 'messages' ? (
        <CommunityMessagePublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.listKind === 'tasks' ? (
        <CommunityTaskPublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.listKind === 'market' && resourceType ? (
        <CommunityResourcePublishModal
          visible={publishOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          resourceType={resourceType}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {section.showRss ? (
        <CommunityNewsSourcesModal
          visible={rssOpen}
          hubBaseUrl={hubBaseUrl}
          userId={userId}
          onClose={() => setRssOpen(false)}
          onPublished={reload}
        />
      ) : null}
      {interactionModals}
    </View>
  )
}

export function MinePanel() {
  const { section, auth, tab, setTab, stats, active } = useCommunityMinePanel()

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={<CommunityRefreshButton loading={false} onPress={() => undefined} />}
      />
      {auth ? (
        <View style={styles.identityRow}>
          <Text style={styles.identityBadge}>{auth.displayName || '用户'}</Text>
          <Text style={styles.identityBadge}>已登录</Text>
        </View>
      ) : null}
      <CommunityStatGrid items={stats} activeId={tab} onSelect={setTab} />
      <View style={styles.feedMeta}>
        <Text style={styles.feedMetaText}>共 0 条</Text>
        <Text style={styles.feedMetaText}>按最新排序</Text>
      </View>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <CommunityEmptyState
          hint={
            auth
              ? `「${active.label}」暂无内容`
              : '请先登录或注册后查看个人发布、安装与收藏'
          }
        />
      </ScrollView>
    </View>
  )
}

export function ManagementPanel() {
  const {
    section,
    canAccessManagement,
    category,
    setCategory,
    subTab,
    setSubTab,
    statItems,
    activeSub,
  } = useCommunityManagementPanel()

  if (!canAccessManagement) {
    return (
      <View style={styles.panelRoot}>
        <CommunityPanelHeader title={section.title} subtitle={section.subtitle} />
        <ScrollView
          contentContainerStyle={styles.panelScrollContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <CommunityEmptyState hint="需要管理权限" />
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.panelRoot}>
      <CommunityPanelHeader
        title={section.title}
        subtitle={section.subtitle}
        actions={
          <CommunityRefreshButton
            loading={false}
            onPress={() => comingSoon('立即扫描')}
          />
        }
      />
      <View style={styles.identityRow}>
        <Text style={styles.identityBadge}>管理控制台</Text>
      </View>
      <CommunityCategoryChips
        items={MODERATION_CATEGORIES}
        activeId={category}
        onSelect={setCategory}
      />
      <CommunityStatGrid
        items={statItems}
        activeId={subTab}
        onSelect={setSubTab}
      />
      <View style={styles.feedMeta}>
        <Text style={styles.feedMetaText}>共 0 条</Text>
        <Text style={styles.feedMetaText}>最近扫描：—</Text>
      </View>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <CommunityEmptyState
          hint={`「${activeSub.label}」暂无条目`}
          meta="完整审核与处置流程与桌面端一致，数据对接后将显示队列。"
        />
      </ScrollView>
    </View>
  )
}
