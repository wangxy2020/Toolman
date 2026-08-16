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

