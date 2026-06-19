import { useCallback, useEffect, useState } from 'react'

import { type CommunityModeratorUser } from '@toolman/shared'

import {
  appointCommunityAdmin,
  listCommunityAdmins,
  revokeCommunityAdmin,
  searchCommunityUsers,
} from './community-api.client'

export function useCommunityAdminManagement(options: {
  canViewList?: boolean
  canManage?: boolean
} = {}) {
  const { canViewList = false, canManage = false } = options
  const [moderators, setModerators] = useState<CommunityModeratorUser[]>([])
  const [searchResults, setSearchResults] = useState<CommunityModeratorUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModerators = useCallback(async () => {
    if (!canViewList) {
      setModerators([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listCommunityAdmins()
      setModerators(result.items)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载管理员列表失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [canViewList])

  const searchUsers = useCallback(
    async (query: string) => {
      const trimmed = query.trim()
      setSearchQuery(trimmed)
      if (!canManage || !trimmed) {
        setSearchResults([])
        return
      }

      setSearching(true)
      setError(null)
      try {
        const result = await searchCommunityUsers({ q: trimmed, limit: 20 })
        setSearchResults(result.items)
      } catch (searchError) {
        const message = searchError instanceof Error ? searchError.message : '搜索用户失败'
        setError(message)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    },
    [canManage],
  )

  const appointAdmin = useCallback(
    async (userId: string) => {
      if (!canManage) return
      setActing(true)
      setError(null)
      try {
        await appointCommunityAdmin(userId)
        await loadModerators()
        if (searchQuery) await searchUsers(searchQuery)
      } catch (appointError) {
        const message = appointError instanceof Error ? appointError.message : '任命管理员失败'
        setError(message)
        throw appointError
      } finally {
        setActing(false)
      }
    },
    [canManage, loadModerators, searchQuery, searchUsers],
  )

  const revokeAdmin = useCallback(
    async (userId: string) => {
      if (!canManage) return
      setActing(true)
      setError(null)
      try {
        await revokeCommunityAdmin(userId)
        await loadModerators()
      } catch (revokeError) {
        const message = revokeError instanceof Error ? revokeError.message : '撤销管理员失败'
        setError(message)
        throw revokeError
      } finally {
        setActing(false)
      }
    },
    [canManage, loadModerators],
  )

  useEffect(() => {
    void loadModerators()
  }, [loadModerators])

  return {
    moderators,
    searchResults,
    searchQuery,
    loading,
    searching,
    acting,
    error,
    loadModerators,
    searchUsers,
    appointAdmin,
    revokeAdmin,
  }
}
