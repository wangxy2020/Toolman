import { useCallback, useEffect, useState } from 'react'

import {
  type CommunityBoardMessage,
  type CommunityInstallItem,
  type CommunityResourceItem,
  type CommunityResourceType,
  type CommunityTaskItem,
} from '@toolman/shared'

import {
  listCommunityBoardMessages,
  listCommunityInstallHistory,
  listCommunityResources,
  listCommunityTasks,
} from './community-api.client'
import { COMMUNITY_USER_DATA_CHANGED_EVENT } from './community-events'
import { COMMUNITY_SESSION_CHANGED_EVENT } from '../user/community-session'
import {
  getUiMockInstall,
  getUiMockResource,
  getUiMockTask,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToMessage,
  applyUiMockInteractionToResource,
} from './community-ui-mock-interactions'
import { useCommunityUser } from './useCommunityUser'

export type UserCenterSection =
  | 'publishes'
  | 'messages'
  | 'installs'
  | 'likes'
  | 'favorites'
  | 'tasks'

export interface UserCenterTaskGroups {
  published: CommunityTaskItem[]
  assigned: CommunityTaskItem[]
}

export interface UserCenterLikes {
  messages: CommunityBoardMessage[]
  resources: CommunityResourceItem[]
}

export interface UserCenterFavorites {
  messages: CommunityBoardMessage[]
  resources: CommunityResourceItem[]
}

const USER_CENTER_RESOURCE_TYPES: CommunityResourceType[] = [
  'knowledge',
  'mcp',
  'skill',
  'workflow',
]

export function groupUserCenterResources(items: CommunityResourceItem[]) {
  return USER_CENTER_RESOURCE_TYPES.reduce(
    (groups, resourceType) => {
      const matched = items.filter((item) => item.resourceType === resourceType)
      if (matched.length > 0) {
        groups[resourceType] = matched
      }
      return groups
    },
    {} as Partial<Record<CommunityResourceType, CommunityResourceItem[]>>,
  )
}

export function useCommunityUserCenter() {
  const user = useCommunityUser()
  const [publishes, setPublishes] = useState<CommunityResourceItem[]>([])
  const [messages, setMessages] = useState<CommunityBoardMessage[]>([])
  const [installs, setInstalls] = useState<CommunityInstallItem[]>([])
  const [likes, setLikes] = useState<UserCenterLikes>({ messages: [], resources: [] })
  const [favorites, setFavorites] = useState<UserCenterFavorites>({
    messages: [],
    resources: [],
  })
  const [tasks, setTasks] = useState<UserCenterTaskGroups>({ published: [], assigned: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const profile = user.profile
    const userId = profile?.id
    if (!userId) {
      setPublishes([])
      setMessages([])
      setInstalls([])
      setLikes({ messages: [], resources: [] })
      setFavorites({ messages: [], resources: [] })
      setTasks({ published: [], assigned: [] })
      return
    }

    setLoading(true)
    setError(null)
    try {
    const [resources, installHistory, taskList, myMessages, boardFeed] = await Promise.all([
        Promise.all(
          USER_CENTER_RESOURCE_TYPES.map((resourceType) =>
            listCommunityResources({ resourceType, authorId: userId, limit: 100 }),
          ),
        ).then((lists) => ({ items: lists.flatMap((list) => list.items) })),
        listCommunityInstallHistory({ limit: 100 }),
        listCommunityTasks({ publisherId: userId, limit: 100 }),
        listCommunityBoardMessages({ userId, limit: 100 }),
        listCommunityBoardMessages({ limit: 100 }),
      ])

      const resourceItems = withUiMockItem(
        resources.items,
        getUiMockResource('mcp'),
      ).map(applyUiMockInteractionToResource)
      const publishes = withUiMockItem(
        resourceItems.filter((item) => item.author.id === userId),
        { ...getUiMockResource('mcp'), author: { id: userId, displayName: profile.displayName } },
      ).map(applyUiMockInteractionToResource)
      const installs = withUiMockItem(installHistory.items, getUiMockInstall(userId))
      const likedResources = resourceItems.filter((item) => item.likedByMe)
      const favoriteResources = resourceItems.filter((item) => item.favoritedByMe)
      const boardItems = boardFeed.items.map(applyUiMockInteractionToMessage)
      const likedMessages = boardItems.filter((item) => item.likedByMe)
      const favoriteMessages = boardItems.filter((item) => item.favoritedByMe)
      const publishedTasks = withUiMockItem(
        taskList.items.filter((item) => item.publisher.id === userId),
        {
          ...getUiMockTask(),
          publisher: { id: userId, displayName: profile.displayName },
        },
      )
      const assignedTasks = taskList.items.filter((item) => item.assigneeId === userId)

      setPublishes(publishes)
      setMessages(myMessages.items.map(applyUiMockInteractionToMessage))
      setInstalls(installs)
      setLikes({ messages: likedMessages, resources: likedResources })
      setFavorites({
        messages: favoriteMessages,
        resources: favoriteResources,
      })
      setTasks({
        published: publishedTasks,
        assigned: assignedTasks,
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载个人数据失败'
      setError(message)
      setPublishes([])
      setMessages([])
      setInstalls([])
      setLikes({ messages: [], resources: [] })
      setFavorites({ messages: [], resources: [] })
      setTasks({ published: [], assigned: [] })
    } finally {
      setLoading(false)
    }
  }, [user.profile?.displayName, user.profile?.id])

  useEffect(() => {
    if (user.loading) return
    void load()
  }, [load, user.loading])

  useEffect(() => {
    const onUserDataChanged = () => {
      void load()
    }
    window.addEventListener(COMMUNITY_USER_DATA_CHANGED_EVENT, onUserDataChanged)
    window.addEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onUserDataChanged)
    return () => {
      window.removeEventListener(COMMUNITY_USER_DATA_CHANGED_EVENT, onUserDataChanged)
      window.removeEventListener(COMMUNITY_SESSION_CHANGED_EVENT, onUserDataChanged)
    }
  }, [load])

  const likeCount = likes.messages.length + likes.resources.length
  const favoriteCount = favorites.messages.length + favorites.resources.length

  return {
    profile: user.profile,
    profileLoading: user.loading,
    profileError: user.error,
    publishes,
    messages,
    installs,
    likes,
    favorites,
    likeCount,
    favoriteCount,
    tasks,
    loading,
    error,
    load,
  }
}
