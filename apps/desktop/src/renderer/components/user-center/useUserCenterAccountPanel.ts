import { useEffect, useState } from 'react'

import { bindAuthProvider, changeAuthPassword, sendAuthSmsCode } from '../../features/user/auth-api.client'
import { useI18n } from '../../i18n/useI18n'
import type { useUserAccount } from '../../features/user/useUserAccount'
import { useAuthBuildProfile } from '../../features/user/useAuthBuildProfile'
import { isRegisteredUser } from '../../features/user/user-account-utils'
import type { ProfileSubView } from './types'

export function useUserCenterAccountPanel(
  account: ReturnType<typeof useUserAccount>,
  onSubViewChange: (view: ProfileSubView) => void,
) {
  const { t } = useI18n()
  const { profile: authBuildProfile } = useAuthBuildProfile()
  const authSession = account.authSession
  const registered = isRegisteredUser(authSession)
  const hasPhoneBinding = authSession?.bindings.some((b) => b.provider === 'tencent_phone')
  const hasWechatBinding = authSession?.bindings.some((b) => b.provider === 'tencent_wechat')
  const hasEmailPasswordBinding = authSession?.bindings.some((b) => b.provider === 'firebase_email')
  const passwordChangeRegion = authSession?.authRegion === 'intl' ? 'intl' : 'cn'
  const canChangePassword =
    (authBuildProfile?.cnAuthEnabled && authSession?.authRegion === 'cn') ||
    (hasEmailPasswordBinding && authSession?.authRegion === 'intl')

  const [bindPhone, setBindPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [bindCooldown, setBindCooldown] = useState(0)
  const [bindBusy, setBindBusy] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteReauth, setShowDeleteReauth] = useState(false)

  useEffect(() => {
    if (bindCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setBindCooldown((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [bindCooldown])

  const sendBindCode = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      const result = await sendAuthSmsCode({ phone: bindPhone.trim(), region: 'cn', intent: 'login' })
      setBindCooldown(result.retryAfterSeconds)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : t('user.errors.sendCodeFailed'))
    } finally {
      setBindBusy(false)
    }
  }

  const submitBindPhone = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      await bindAuthProvider({
        provider: 'tencent_phone',
        payload: { phone: bindPhone.trim(), code: bindCode.trim() },
      })
      onSubViewChange('main')
      void account.load().catch(() => undefined)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : t('user.errors.bindFailed'))
    } finally {
      setBindBusy(false)
    }
  }

  const submitBindWechat = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      await bindAuthProvider({ provider: 'tencent_wechat' })
      onSubViewChange('main')
      void account.load().catch(() => undefined)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : t('user.errors.bindFailed'))
    } finally {
      setBindBusy(false)
    }
  }

  const submitChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError(t('user.auth.passwordMismatch'))
      return
    }

    setPasswordBusy(true)
    setPasswordError(null)
    try {
      await changeAuthPassword({
        region: passwordChangeRegion,
        oldPassword,
        newPassword,
        confirmPassword,
      })
      setPasswordSuccess(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t('user.errors.changePasswordFailed'))
    } finally {
      setPasswordBusy(false)
    }
  }

  return {
    t,
    account,
    authSession,
    registered,
    hasPhoneBinding,
    hasWechatBinding,
    canChangePassword,
    bindPhone,
    setBindPhone,
    bindCode,
    setBindCode,
    bindCooldown,
    bindBusy,
    bindError,
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    passwordBusy,
    passwordError,
    passwordSuccess,
    sendBindCode,
    submitBindPhone,
    submitBindWechat,
    submitChangePassword,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showDeleteReauth,
    setShowDeleteReauth,
  }
}
