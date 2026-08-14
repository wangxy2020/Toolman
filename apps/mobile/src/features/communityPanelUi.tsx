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
import { COMMUNITY_ACTION_LABELS } from './communitySidebar'
import type { CommunityListItem } from './communityHubClient'

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
          <Text style={uiStyles.fileCardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.infoRows.length > 0 ? (
            <View style={uiStyles.infoList}>
              {item.infoRows.map((row) => (
                <View key={`${row.label}-${row.value}`} style={uiStyles.infoRow}>
                  <Text style={uiStyles.infoLabel}>{row.label}</Text>
                  <Text style={uiStyles.infoValue} numberOfLines={1}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {item.description ? (
            <Text style={uiStyles.fileCardDesc} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
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

export function sortCommunityItems(items: CommunityListItem[]): CommunityListItem[] {
  return [...items].sort((a, b) => {
    const byTime = b.createdAt - a.createdAt
    if (byTime !== 0) return byTime
    return a.title.localeCompare(b.title, 'zh-CN')
  })
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
  panelHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
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
  listItem: {
    marginHorizontal: 20,
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
  infoList: {
    marginTop: 6,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    width: 64,
    fontSize: 11,
    color: colors.textSecondary,
  },
  infoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: colors.text,
  },
  fileCardDesc: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
