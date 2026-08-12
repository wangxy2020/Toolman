import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { IconPlus, IconRefresh } from '../icons/composer-icons'
import { colors } from '../theme'
import {
  COMMUNITY_ACTION_LABELS,
  COMMUNITY_SORT_OPTIONS,
  type CommunitySortField,
} from './communitySidebar'
import type { CommunityListItem } from './communityHubClient'

export function CommunityOfflineBanner(props: { visible: boolean; message?: string }) {
  if (!props.visible) return null
  return (
    <View style={uiStyles.offlineBanner}>
      <Text style={uiStyles.offlineTitle}>社区 Hub 离线</Text>
      <Text style={uiStyles.offlineHint}>
        {props.message ??
          '当前为本地缓存只读模式，发布、点赞等写操作暂不可用。请在设置 → 社区配置 Hub，并确认桌面端 Community Hub 已启动。'}
      </Text>
    </View>
  )
}

export function CommunityPanelHeader(props: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <View style={uiStyles.panelHeader}>
      <View style={uiStyles.panelHeaderText}>
        <Text style={uiStyles.panelTitle}>{props.title}</Text>
        <Text style={uiStyles.panelSubtitle}>{props.subtitle}</Text>
      </View>
      {props.actions ? <View style={uiStyles.panelActions}>{props.actions}</View> : null}
    </View>
  )
}

export function CommunityPublishButton(props: {
  label: string
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled || !props.onPress}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.publishBtn,
        (props.disabled || !props.onPress) && uiStyles.btnDisabled,
        pressed && !props.disabled ? uiStyles.publishBtnPressed : null,
      ]}
      accessibilityLabel={props.label}
    >
      <IconPlus size={14} color={colors.accent} />
      <Text style={uiStyles.publishBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function CommunitySecondaryButton(props: {
  label: string
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.secondaryBtn,
        props.disabled && uiStyles.btnDisabled,
        pressed && !props.disabled ? uiStyles.secondaryBtnPressed : null,
      ]}
      accessibilityLabel={props.label}
    >
      <Text style={uiStyles.secondaryBtnText}>{props.label}</Text>
    </Pressable>
  )
}

export function CommunityRefreshButton(props: {
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={props.disabled || props.loading}
      onPress={props.onPress}
      style={({ pressed }) => [
        uiStyles.iconBtn,
        (props.disabled || props.loading) && uiStyles.btnDisabled,
        pressed ? uiStyles.iconBtnPressed : null,
      ]}
      accessibilityLabel="刷新"
    >
      {props.loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <IconRefresh size={16} color={colors.textSecondary} />
      )}
    </Pressable>
  )
}

export function CommunitySortToolbar(props: {
  sortField: CommunitySortField
  sortAscending: boolean
  onSortFieldChange: (field: CommunitySortField) => void
}) {
  return (
    <View style={uiStyles.sortRow}>
      {COMMUNITY_SORT_OPTIONS.map((option) => {
        const active = props.sortField === option.id
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onSortFieldChange(option.id)}
            style={[uiStyles.sortItem, active ? uiStyles.sortItemActive : null]}
          >
            <Text style={[uiStyles.sortLabel, active ? uiStyles.sortLabelActive : null]}>
              {option.label}
              {active ? (props.sortAscending ? ' ↑' : ' ↓') : ''}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function CommunityListCard(props: {
  item: CommunityListItem
  selected?: boolean
  showInstall?: boolean
  onPress?: () => void
}) {
  const { item } = props
  return (
    <View style={[uiStyles.listItem, props.selected ? uiStyles.listItemSelected : null]}>
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [uiStyles.fileCard, pressed ? uiStyles.fileCardPressed : null]}
      >
        <View style={uiStyles.fileCardMain}>
          <Text style={uiStyles.fileCardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.meta ? (
            <Text style={uiStyles.fileCardMeta} numberOfLines={1}>
              {item.meta}
            </Text>
          ) : null}
          <Text
            style={[uiStyles.fileCardDesc, !item.description ? uiStyles.fileCardDescEmpty : null]}
            numberOfLines={2}
          >
            {item.description || ' '}
          </Text>
        </View>
      </Pressable>
      <View style={uiStyles.actionRow}>
        <ActionChip label={COMMUNITY_ACTION_LABELS.like} count={item.likeCount} />
        <ActionChip label={COMMUNITY_ACTION_LABELS.comment} count={item.commentCount} />
        <ActionChip label={COMMUNITY_ACTION_LABELS.dislike} count={item.dislikeCount} />
        <ActionChip label={COMMUNITY_ACTION_LABELS.favorite} count={item.favoriteCount} />
        <ActionChip label={COMMUNITY_ACTION_LABELS.share} />
        {props.showInstall ? (
          <ActionChip label={COMMUNITY_ACTION_LABELS.install} count={item.installCount} />
        ) : null}
        <ActionChip label={COMMUNITY_ACTION_LABELS.report} />
      </View>
    </View>
  )
}

function ActionChip(props: { label: string; count?: number }) {
  const text =
    typeof props.count === 'number' && props.count > 0
      ? `${props.label} ${props.count}`
      : props.label
  return (
    <View style={uiStyles.actionChip}>
      <Text style={uiStyles.actionChipText}>{text}</Text>
    </View>
  )
}

export function CommunityStatGrid<T extends string>(props: {
  items: Array<{ id: T; label: string; count: number }>
  activeId: T
  onSelect: (id: T) => void
}) {
  return (
    <View style={uiStyles.statGrid}>
      {props.items.map((item) => {
        const active = item.id === props.activeId
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onSelect(item.id)}
            style={[uiStyles.statCard, active ? uiStyles.statCardActive : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[uiStyles.statLabel, active ? uiStyles.statLabelActive : null]}>
              {item.label}
            </Text>
            <Text style={[uiStyles.statValue, active ? uiStyles.statValueActive : null]}>
              {item.count}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function CommunityCategoryChips<T extends string>(props: {
  items: Array<{ id: T; label: string }>
  activeId: T
  onSelect: (id: T) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={uiStyles.chipRow}
    >
      {props.items.map((item) => {
        const active = item.id === props.activeId
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onSelect(item.id)}
            style={[uiStyles.chip, active ? uiStyles.chipActive : null]}
          >
            <Text style={[uiStyles.chipLabel, active ? uiStyles.chipLabelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

export function sortCommunityItems(
  items: CommunityListItem[],
  field: CommunitySortField,
  ascending: boolean,
): CommunityListItem[] {
  const sorted = [...items].sort((a, b) => {
    let cmp = 0
    if (field === 'name') cmp = a.title.localeCompare(b.title, 'zh-CN')
    else if (field === 'size') cmp = a.sizeBytes - b.sizeBytes
    else cmp = a.createdAt - b.createdAt
    return ascending ? cmp : -cmp
  })
  return sorted
}

export function CommunityEmptyState(props: { hint: string; meta?: string }) {
  return (
    <View style={uiStyles.emptyBody}>
      <Text style={uiStyles.emptyHint}>{props.hint}</Text>
      {props.meta ? <Text style={uiStyles.emptyMeta}>{props.meta}</Text> : null}
    </View>
  )
}

export const uiStyles = StyleSheet.create({
  offlineBanner: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fed7aa',
    gap: 4,
  },
  offlineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#c2410c',
  },
  offlineHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#9a3412',
  },
  panelHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  publishBtnPressed: {
    opacity: 0.85,
  },
  publishBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent,
  },
  secondaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  secondaryBtnPressed: {
    backgroundColor: colors.borderLight,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.hover,
  },
  iconBtnPressed: {
    backgroundColor: colors.borderLight,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sortItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  sortItemActive: {
    backgroundColor: colors.accentSoft,
  },
  sortLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sortLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  listItem: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  listItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  fileCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  fileCardPressed: {
    opacity: 0.9,
  },
  fileCardMain: {
    gap: 4,
  },
  fileCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fileCardMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  fileCardDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  fileCardDescEmpty: {
    opacity: 0,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  actionChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.hover,
  },
  actionChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyBody: {
    gap: 8,
    paddingVertical: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  emptyMeta: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textSecondary,
    opacity: 0.9,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  statCard: {
    minWidth: '30%',
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  statCardActive: {
    backgroundColor: colors.accentSoft,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statLabelActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  statValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statValueActive: {
    color: colors.accent,
  },
  chipRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
})
