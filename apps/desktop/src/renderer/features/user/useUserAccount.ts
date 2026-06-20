import { useCallback, useEffect, useState } from 'react'

import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  isRegisteredAuthSession,
  type AuthSession,
  type CommunityUserProfile,
  type IdentityProfile,
} from '@toolman/shared'

import {
  getCommunityHubStatus,
  getCommunityUserMe,
  touchCommunityPresenceHeartbeat,
  updateCommunityUserMe,
} from '../community/community-api.client'
import { deleteAuthAccount, logoutAuth } from './auth-api.client'
import { useAuthSession } from './AuthSessionProvider'
import { getIdentityProfile, updateIdentityProfile } from './identity-api.client'
import { isCommunitySessionActive, setCommunitySessionActive } from './community-session'

const DISPLAY_NAME_MAX_LENGTH = 10

export function useUserAccount() {
  const { session: authSession, refresh: refreshAuthSession } = useAuthSession()
  const [identity, setIdentity] = useState<IdentityProfile | null>(null)
  const [communityProfile, setCommunityProfile] = useState<CommunityUserProfile | null>(null)
  const [hubOnline, setHubOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRegistered = isRegisteredAuthSession(authSession ?? { registrationStatus: 'guest' })
  const isLoggedIn = Boolean(authSession?.isLoggedIn)

  const loadIdentity = useCallback(async () => {
    const profile = await getIdentityProfile()
    setIdentity(profile)
    return profile
  }, [])

  const loadCommunity = useCallback(async (session: AuthSession | null) => {
    const status = await getCommunityHubStatus()
    setHubOnline(status.running)
    if (!status.running) {
      setCommunityProfile(null)
      return null
    }

    if (!isRegisteredAuthSession(session ?? { registrationStatus: 'guest' }) || !session?.isLoggedIn) {
      setCommunityProfile(null)
      if (isCommunitySessionActive()) {
        setCommunitySessionActive(false)
      }
      return null
    }

    setCommunitySessionActive(true)
    const profile = await getCommunityUserMe()
    setCommunityProfile(profile)
    return profile
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [, session] = await Promise.all([loadIdentity(), refreshAuthSession()])
      await loadCommunity(session).catch(() => {
        setCommunityProfile(null)
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载账户信息失败'
      setError(message)
      throw loadError
    } finally {
      setLoading(false)
    }
  }, [loadCommunity, loadIdentity, refreshAuthSession])

  const saveDisplayName = useCallback(
    async (displayName: string) => {
      const trimmed = displayName.trim()
      if (!trimmed) {
        throw new Error('显示名称不能为空')
      }
      if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
        throw new Error(`显示名称不能超过 ${DISPLAY_NAME_MAX_LENGTH} 个字符`)
      }

      setSaving(true)
      setError(null)
      try {
        const updated = await updateIdentityProfile({ displayName: trimmed })
        setIdentity(updated)

        if (hubOnline && isRegistered && isLoggedIn) {
          try {
            const community = await updateCommunityUserMe({ displayName: trimmed })
            setCommunityProfile(community)
          } catch {
            // Local identity saved; community sync is best-effort.
          }
        }
        return updated
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : '保存失败'
        setError(message)
        throw saveError
      } finally {
        setSaving(false)
      }
    },
    [hubOnline, isLoggedIn, isRegistered],
  )

  const saveBio = useCallback(
    async (bio: string) => {
      if (!hubOnline || !isRegistered || !isLoggedIn) {
        throw new Error('登录并启动社区 Hub 后才能编辑简介')
      }

      setSaving(true)
      setError(null)
      try {
        const trimmed = bio.trim()
        const community = await updateCommunityUserMe({
          bio: trimmed.length > 0 ? trimmed : '',
        })
        setCommunityProfile(community)
        return community
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : '保存简介失败'
        setError(message)
        throw saveError
      } finally {
        setSaving(false)
      }
    },
    [hubOnline, isLoggedIn, isRegistered],
  )

  const pickAvatar = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
        multiple: false,
      })
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      const { paths } = DialogSelectFilesOutputSchema.parse(result.data)
      const sourcePath = paths[0]
      if (!sourcePath) return identity

      const updated = await updateIdentityProfile({ avatarSourcePath: sourcePath })
      setIdentity(updated)
      return updated
    } catch (pickError) {
      const message = pickError instanceof Error ? pickError.message : '设置头像失败'
      setError(message)
      throw pickError
    } finally {
      setSaving(false)
    }
  }, [identity])

  const clearAvatar = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateIdentityProfile({ clearAvatar: true })
      setIdentity(updated)
      return updated
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : '移除头像失败'
      setError(message)
      throw clearError
    } finally {
      setSaving(false)
    }
  }, [])

  const logoutAccount = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await logoutAuth()
      setCommunitySessionActive(false)
      setCommunityProfile(null)
      await refreshAuthSession()
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : '退出登录失败'
      setError(message)
      throw logoutError
    } finally {
      setSaving(false)
    }
  }, [refreshAuthSession])

  const deleteAccount = useCallback(async (options?: { reauthToken?: string }) => {
    setSaving(true)
    setError(null)
    try {
      await deleteAuthAccount({
        confirmation: 'DELETE',
        reauthToken: options?.reauthToken,
      })
      setCommunitySessionActive(false)
      setCommunityProfile(null)
      await refreshAuthSession()
      await loadIdentity()
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '注销账户失败'
      setError(message)
      throw deleteError
    } finally {
      setSaving(false)
    }
  }, [loadIdentity, refreshAuthSession])

  useEffect(() => {
    void load().catch(() => undefined)
  }, [load])

  useEffect(() => {
    if (isRegistered && isLoggedIn) {
      void touchCommunityPresenceHeartbeat().catch(() => undefined)
    }
  }, [isLoggedIn, isRegistered])

  return {
    authSession,
    identity,
    communityProfile,
    hubOnline,
    loading,
    saving,
    error,
    isRegistered,
    isLoggedIn,
    load,
    refreshAuthSession,
    saveDisplayName,
    saveBio,
    pickAvatar,
    clearAvatar,
    logoutAccount,
    deleteAccount,
  }
}
