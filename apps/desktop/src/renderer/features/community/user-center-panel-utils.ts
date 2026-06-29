import { type CommunityResourceType } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { type UserCenterSection } from './useCommunityUserCenter'

export const USER_CENTER_SECTIONS: Array<{
  key: UserCenterSection
  labelKey: `communityPage.mine.sections.${UserCenterSection}`
}> = [
  { key: 'publishes', labelKey: 'communityPage.mine.sections.publishes' },
  { key: 'messages', labelKey: 'communityPage.mine.sections.messages' },
  { key: 'installs', labelKey: 'communityPage.mine.sections.installs' },
  { key: 'likes', labelKey: 'communityPage.mine.sections.likes' },
  { key: 'favorites', labelKey: 'communityPage.mine.sections.favorites' },
  { key: 'tasks', labelKey: 'communityPage.mine.sections.tasks' },
]

export type FeedStat = {
  kind: 'like' | 'favorite' | 'reply'
  label: string
  accent?: boolean
}

export function getUserCenterResourceLabel(
  type: CommunityResourceType,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const key = `communityPage.mine.resourceTypes.${type}` as const
  return t(key)
}

export function formatUserCenterDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function getSectionCount(
  section: UserCenterSection,
  center: {
    publishes: unknown[]
    messages: unknown[]
    installs: unknown[]
    likeCount: number
    favoriteCount: number
    tasks: { published: unknown[]; assigned: unknown[] }
  },
): number {
  switch (section) {
    case 'publishes':
      return center.publishes.length
    case 'messages':
      return center.messages.length
    case 'installs':
      return center.installs.length
    case 'likes':
      return center.likeCount
    case 'favorites':
      return center.favoriteCount
    case 'tasks':
      return center.tasks.published.length + center.tasks.assigned.length
  }
}
