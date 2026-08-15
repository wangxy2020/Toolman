import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import {
  CommunityMessagePublishModal,
  CommunityNewsSourcesModal,
  CommunityResourcePublishModal,
  CommunityTaskPublishModal,
} from './CommunityPublishModals'
import {
  COMMUNITY_SIDEBAR_SECTIONS,
  MODERATION_CATEGORIES,
} from './communitySidebar'
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
import { comingSoon } from './communityPaneUtils'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import {
  useCommunityListSection,
  useCommunityManagementPanel,
  useCommunityMinePanel,
  useCommunityUi,
  type CommunityListSectionId,
} from './useCommunityPanes'

export { CommunityUiProvider } from './useCommunityPanes'

export function CommunityLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { activeSection, setActiveSection, canAccessManagement } = useCommunityUi()
  const sections = COMMUNITY_SIDEBAR_SECTIONS.filter(
    (section) => section.id !== 'management' || canAccessManagement,
  )

  return (
    <SidebarShell>
      <SidebarAddButton
        label="探索社区"
        disabled
        onPress={() => undefined}
      />
      <SidebarList>
        {sections.map((section) => (
          <SidebarItem
            key={section.id}
            label={section.label}
            active={activeSection === section.id}
            onPress={() => {
              setActiveSection(section.id)
              setLeftOpen(false)
            }}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

function CommunityListSectionPanel({
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
  } = useCommunityListSection(sectionId)

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
        <Text style={styles.readonlyHint}>列表可浏览，点赞、评论、收藏请在桌面端操作。</Text>
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
              selected={selectedId === item.id}
              showInstall={section.showInstall}
              onPress={() => setSelectedId(item.id)}
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
    </View>
  )
}

function MinePanel() {
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

function ManagementPanel() {
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

export function CommunityRightPane() {
  const { activeSection } = useCommunityUi()

  switch (activeSection) {
    case 'mine':
      return <MinePanel />
    case 'management':
      return <ManagementPanel />
    case 'news':
    case 'messages':
    case 'knowledge':
    case 'mcp':
    case 'skills':
    case 'workflow':
    case 'tasks':
      return <CommunityListSectionPanel sectionId={activeSection} />
    default:
      return <Text style={shellStyles.emptyHint}>选择社区分区</Text>
  }
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    paddingBottom: 28,
    paddingTop: 4,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  readonlyHint: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  identityBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.hover,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  feedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
