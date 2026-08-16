import { useState, type ReactNode } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
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
import { COMMUNITY_ACTION_LABELS } from './communitySidebar'
import type { CommunityCardIconKind, CommunityListItem } from './communityHubClient'
import { formatCommunityCount } from './communityListFormat'
import { colors } from '../theme'
import { uiStyles } from './communityPanelUi.styles'

export type CommunityCardActionHandlers = {
  onLike?: () => void
  onDislike?: () => void
  onFavorite?: () => void
  onComment?: () => void
  onShare?: () => void
  onReport?: () => void
  busyAction?: 'like' | 'dislike' | 'favorite' | 'comment' | 'share' | 'report' | null
  commentsExpanded?: boolean
}

export function CommunityListCard(props: {
  item: CommunityListItem
  selected?: boolean
  showInstall?: boolean
  onPress?: () => void
  actions?: CommunityCardActionHandlers
  /** Render only the interaction bar (e.g. under detail body). */
  actionsOnly?: boolean
}) {
  const { item, actions } = props
  const interactive = Boolean(actions)
  const busy = actions?.busyAction ?? null

  const actionBar = (
    <View
      style={[
        uiStyles.actionBar,
        interactive ? uiStyles.actionBarInteractive : null,
        props.selected ? uiStyles.actionBarSelected : null,
        actions?.commentsExpanded ? uiStyles.actionBarCommentsOpen : null,
        props.actionsOnly ? uiStyles.actionBarStandalone : null,
      ]}
    >
      <View style={uiStyles.actionBarStart}>
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
          active={item.likedByMe}
          disabled={busy === 'like'}
          onPress={actions?.onLike}
          icon={
            <IconThumbUp
              size={14}
              color={item.likedByMe ? colors.accent : colors.textSecondary}
            />
          }
        />
        <ActionIcon
          label={COMMUNITY_ACTION_LABELS.comment}
          count={item.commentCount}
          active={actions?.commentsExpanded}
          disabled={busy === 'comment'}
          onPress={actions?.onComment}
          icon={
            <IconComment
              size={14}
              color={actions?.commentsExpanded ? colors.accent : colors.textSecondary}
            />
          }
        />
        <ActionIcon
          label={COMMUNITY_ACTION_LABELS.dislike}
          count={item.dislikeCount}
          active={item.dislikedByMe}
          disabled={busy === 'dislike'}
          onPress={actions?.onDislike}
          icon={
            <IconThumbDown
              size={14}
              color={item.dislikedByMe ? colors.accent : colors.textSecondary}
            />
          }
        />
        <ActionIcon
          label={COMMUNITY_ACTION_LABELS.favorite}
          count={item.favoriteCount}
          active={item.favoritedByMe}
          disabled={busy === 'favorite'}
          onPress={actions?.onFavorite}
          icon={
            <IconStar
              size={14}
              color={item.favoritedByMe ? colors.accent : colors.textSecondary}
            />
          }
        />
        <ActionIcon
          label={COMMUNITY_ACTION_LABELS.share}
          disabled={busy === 'share'}
          onPress={actions?.onShare}
          icon={<IconShare size={14} color={colors.textSecondary} />}
        />
        <ActionIcon
          label={COMMUNITY_ACTION_LABELS.report}
          disabled={busy === 'report'}
          onPress={actions?.onReport}
          icon={<IconFlag size={14} color={colors.textSecondary} />}
        />
      </View>
    </View>
  )

  if (props.actionsOnly) {
    return <View style={uiStyles.listItem}>{actionBar}</View>
  }

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
      {actionBar}
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

function ActionIcon(props: {
  label: string
  count?: number
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  onPress?: () => void
}) {
  if (!props.onPress) {
    return (
      <View
        style={[uiStyles.actionIcon, props.active ? uiStyles.actionIconActive : null]}
        accessibilityLabel={props.label}
      >
        {props.icon}
        {props.count != null ? (
          <Text style={[uiStyles.actionCount, props.active ? uiStyles.actionCountActive : null]}>
            {formatCommunityCount(props.count)}
          </Text>
        ) : null}
      </View>
    )
  }
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        uiStyles.actionIcon,
        props.active ? uiStyles.actionIconActive : null,
        pressed ? uiStyles.actionIconPressed : null,
        props.disabled ? uiStyles.btnDisabled : null,
      ]}
      accessibilityLabel={props.label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(props.active), disabled: Boolean(props.disabled) }}
    >
      {props.icon}
      {props.count != null ? (
        <Text style={[uiStyles.actionCount, props.active ? uiStyles.actionCountActive : null]}>
          {formatCommunityCount(props.count)}
        </Text>
      ) : null}
    </Pressable>
  )
}
