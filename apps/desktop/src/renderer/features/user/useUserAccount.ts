import { useCallback, useEffect, useState } from 'react'

import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  type CommunityUserProfile,
  type IdentityProfile,
} from '@toolman/shared'

import {
  getCommunityHubStatus,
  getCommunityUserMe,
  touchCommunityPresenceHeartbeat,
  updateCommunityUserMe,
} from '../community/community-api.client'
import { getIdentityProfile, updateIdentityProfile } from './identity-api.client'
import { isCommunitySessionActive, setCommunitySessionActive } from './community-session'

const DISPLAY_NAME_MAX_LENGTH = 10

export function useUserAccount() {
  const [identity, setIdentity] = useState<IdentityProfile | null>(null)
  const [communityProfile, setCommunityProfile] = useState<CommunityUserProfile | null>(null)
  const [hubOnline, setHubOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadIdentity = useCallback(async () => {
    const profile = await getIdentityProfile()
    setIdentity(profile)
    return profile
  }, [])

  const loadCommunity = useCallback(async () => {
    const status = await getCommunityHubStatus()
    setHubOnline(status.running)
    if (!status.running) {
      setCommunityProfile(null)
      return null
    }
    if (!isCommunitySessionActive()) {
      setCommunityProfile(null)
      return null
    }
    const profile = await getCommunityUserMe()
    setCommunityProfile(profile)
    return profile
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadIdentity()
      await loadCommunity().catch(() => {
        setCommunityProfile(null)
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载账户信息失败'
      setError(message)
      throw loadError
    } finally {
      setLoading(false)
    }
  }, [loadCommunity, loadIdentity])

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

        if (hubOnline) {
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
    [hubOnline],
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

  const loginCommunity = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      setCommunitySessionActive(true)
      const profile = await loadCommunity()
      if (!profile) {
        setCommunitySessionActive(false)
        throw new Error('社区服务未启动，无法登录')
      }
      void touchCommunityPresenceHeartbeat().catch(() => undefined)
      if (identity?.displayName && profile.displayName !== identity.displayName) {
        const synced = await updateCommunityUserMe({ displayName: identity.displayName })
        setCommunityProfile(synced)
        return synced
      }
      return profile
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : '社区登录失败'
      setError(message)
      throw loginError
    } finally {
      setSaving(false)
    }
  }, [identity?.displayName, loadCommunity])

  const logoutCommunity = useCallback(() => {
    setCommunitySessionActive(false)
    setCommunityProfile(null)
    setError(null)
  }, [])

  useEffect(() => {
    void load().catch(() => undefined)
  }, [load])

  return {
    identity,
    communityProfile,
    hubOnline,
    loading,
    saving,
    error,
    load,
    saveDisplayName,
    pickAvatar,
    clearAvatar,
    loginCommunity,
    logoutCommunity,
  }
}
