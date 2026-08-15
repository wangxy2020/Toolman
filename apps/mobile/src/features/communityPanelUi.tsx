import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { IconPlus, IconRefresh } from '../icons/composer-icons'
import {
  IconComment,
  IconDownload,
  IconFlag,
  IconKnowledge,
  IconMcp,
  IconMessageBoard,
  IconNews,
  IconShare,
  IconSkill,
  IconStar,
  IconTaskList,
  IconThumbDown,
  IconThumbUp,
  IconWorkflow,
} from '../icons/community-icons'
import { colors } from '../theme'
import { COMMUNITY_ACTION_LABELS } from './communitySidebar'
import type { CommunityCardIconKind, CommunityListItem } from './communityHubClient'
import { formatCommunityCount, sortCommunityItems } from './communityListFormat'

export { sortCommunityItems }

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
    <View style={uiStyles.listItem}>
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [
          uiStyles.fileCard,
          props.selected ? uiStyles.fileCardSelected : null,
          pressed ? uiStyles.fileCardPressed : null,
        ]}
      >
        <CommunityListCoverIcon
          coverUrl={item.coverUrl}
          iconKind={item.iconKind}
          alt={item.title}
        />
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
            style={[uiStyles.fileCardDesc, item.description ? null : uiStyles.fileCardDescEmpty]}
            numberOfLines={2}
          >
            {item.description || ' '}
          </Text>
        </View>
      </Pressable>
      <View
        style={[uiStyles.actionBar, props.selected ? uiStyles.actionBarSelected : null]}
        pointerEvents="none"
        accessibilityRole="text"
        accessibilityLabel="互动数据只读，请在桌面端操作"
      >
        <View style={uiStyles.actionBarStart}>
          <Text style={uiStyles.actionBarReadonly}>只读</Text>
          {props.showInstall ? (
            <ActionIcon
              label={COMMUNITY_ACTION_LABELS.install}
              count={item.installCount}
              icon={<IconDownload size={14} color={colors.textSecondary} />}
            />
          ) : null}
        </View>
        <View style={uiStyles.actionBarMain}>
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.like}
            count={item.likeCount}
            icon={<IconThumbUp size={14} color={colors.textSecondary} />}
          />
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.comment}
            count={item.commentCount}
            icon={<IconComment size={14} color={colors.textSecondary} />}
          />
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.dislike}
            count={item.dislikeCount}
            icon={<IconThumbDown size={14} color={colors.textSecondary} />}
          />
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.favorite}
            count={item.favoriteCount}
            icon={<IconStar size={14} color={colors.textSecondary} />}
          />
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.share}
            icon={<IconShare size={14} color={colors.textSecondary} />}
          />
          <ActionIcon
            label={COMMUNITY_ACTION_LABELS.report}
            icon={<IconFlag size={14} color={colors.textSecondary} />}
          />
        </View>
      </View>
    </View>
  )
}

function CommunityListCoverIcon(props: {
  coverUrl?: string | null
  iconKind: CommunityCardIconKind
  alt: string
}) {
  const [failed, setFailed] = useState(false)
  const showCover = Boolean(props.coverUrl) && !failed
  return (
    <View style={[uiStyles.fileCardIcon, showCover ? uiStyles.fileCardIconCover : null]}>
      {showCover ? (
        <Image
          source={{ uri: props.coverUrl! }}
          accessibilityLabel={props.alt}
          style={uiStyles.fileCardCover}
          onError={() => setFailed(true)}
        />
      ) : (
        <CommunityKindIcon kind={props.iconKind} />
      )}
    </View>
  )
}

function CommunityKindIcon({ kind }: { kind: CommunityCardIconKind }) {
  const color = colors.textSecondary
  switch (kind) {
    case 'messages':
      return <IconMessageBoard size={18} color={color} />
    case 'news':
      return <IconNews size={18} color={color} />
    case 'tasks':
      return <IconTaskList size={18} color={color} />
    case 'mcp':
      return <IconMcp size={18} color={color} />
    case 'skill':
      return <IconSkill size={18} color={color} />
    case 'workflow':
      return <IconWorkflow size={18} color={color} />
    default:
      return <IconKnowledge size={18} color={color} />
  }
}

function ActionIcon(props: { label: string; count?: number; icon: ReactNode }) {
  return (
    <View style={uiStyles.actionIcon} accessibilityLabel={props.label}>
      {props.icon}
      {props.count != null ? (
        <Text style={uiStyles.actionCount}>{formatCommunityCount(props.count)}</Text>
      ) : null}
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
    marginBottom: 10,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: colors.surface,
  },
  fileCardSelected: {
    borderColor: colors.accent,
  },
  fileCardPressed: {
    backgroundColor: colors.hover,
  },
  fileCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.hover,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  fileCardIconCover: {
    padding: 0,
  },
  fileCardCover: {
    width: 36,
    height: 36,
  },
  fileCardMain: {
    flex: 1,
    minWidth: 0,
  },
  fileCardTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,
  },
  fileCardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fileCardDesc: {
    marginTop: 4,
    minHeight: 36,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  fileCardDescEmpty: {
    opacity: 0,
  },
  actionBarReadonly: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 4,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    opacity: 0.72,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    borderColor: colors.border,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#f4f4f5',
    marginTop: -1,
  },
  actionBarSelected: {
    borderColor: colors.accent,
  },
  actionBarStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBarMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionCount: {
    minWidth: 8,
    fontSize: 12,
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
