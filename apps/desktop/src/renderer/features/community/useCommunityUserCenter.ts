import { useCallback, useEffect, useState } from 'react'

import {
  type CommunityBoardMessage,
  type CommunityInstallItem,
  type CommunityNewsArticle,
  type CommunityResourceItem,
  type CommunityTaskItem,
} from '@toolman/shared'

import {
  listCommunityBoardMessages,
  listCommunityInstallHistory,
  listCommunityNewsArticles,
  listCommunityResources,
  listCommunityTasks,
} from './community-api.client'
import { COMMUNITY_BOARD_CHANGED_EVENT } from './community-events'
import {
  getUiMockInstall,
  getUiMockNewsArticle,
  getUiMockResource,
  getUiMockTask,
  withUiMockItem,
} from './community-ui-mock'
import {
  applyUiMockInteractionToMessage,
  applyUiMockInteractionToNews,
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
  news: CommunityNewsArticle[]
  messages: CommunityBoardMessage[]
}

export interface UserCenterFavorites {
  news: CommunityNewsArticle[]
  messages: CommunityBoardMessage[]
}

export function useCommunityUserCenter() {
  const user = useCommunityUser()
  const [publishes, setPublishes] = useState<CommunityResourceItem[]>([])
  const [messages, setMessages] = useState<CommunityBoardMessage[]>([])
  const [installs, setInstalls] = useState<CommunityInstallItem[]>([])
  const [likes, setLikes] = useState<UserCenterLikes>({ news: [], messages: [] })
  const [favorites, setFavorites] = useState<UserCenterFavorites>({ news: [], messages: [] })
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
      setLikes({ news: [], messages: [] })
      setFavorites({ news: [], messages: [] })
      setTasks({ published: [], assigned: [] })
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [resources, installHistory, news, taskList, myMessages, boardFeed] = await Promise.all([
        listCommunityResources({ limit: 100 }),
        listCommunityInstallHistory({ limit: 100 }),
        listCommunityNewsArticles({ limit: 100 }),
        listCommunityTasks({ limit: 100 }),
        listCommunityBoardMessages({ userId, limit: 100 }),
        listCommunityBoardMessages({ limit: 100 }),
      ])

      const publishes = withUiMockItem(
        resources.items.filter((item) => item.author.id === userId),
        { ...getUiMockResource('mcp'), author: { id: userId, displayName: profile.displayName } },
      ).map(applyUiMockInteractionToResource)
      const installs = withUiMockItem(installHistory.items, getUiMockInstall(userId))
      const newsItems = withUiMockItem(news.items, getUiMockNewsArticle()).map(
        applyUiMockInteractionToNews,
      )
      const likedNews = withUiMockItem(
        newsItems.filter((item) => item.likedByMe),
        { ...getUiMockNewsArticle(), likedByMe: true },
      ).map(applyUiMockInteractionToNews)
      const favoriteNews = withUiMockItem(
        newsItems.filter((item) => item.favoritedByMe),
        { ...getUiMockNewsArticle(), favoritedByMe: true },
      ).map(applyUiMockInteractionToNews)
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
      setLikes({ news: likedNews, messages: likedMessages })
      setFavorites({ news: favoriteNews, messages: favoriteMessages })
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
      setLikes({ news: [], messages: [] })
      setFavorites({ news: [], messages: [] })
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
    const onBoardChanged = () => {
      void load()
    }
    window.addEventListener(COMMUNITY_BOARD_CHANGED_EVENT, onBoardChanged)
    return () => window.removeEventListener(COMMUNITY_BOARD_CHANGED_EVENT, onBoardChanged)
  }, [load])

  const likeCount = likes.news.length + likes.messages.length
  const favoriteCount = favorites.news.length + favorites.messages.length

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
