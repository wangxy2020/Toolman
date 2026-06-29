import { useEffect, useMemo, useState } from 'react'

import type { AuthOtpChannel, AuthRegion } from '@toolman/shared'
import { IpcChannel } from '@toolman/shared'

import { loginAuth } from '../../features/user/auth-api.client'
import {
  consumeFirebaseRedirectLogin,
  formatFirebaseAuthError,
} from '../../features/user/firebase-auth.client'
import { useI18n } from '../../i18n/useI18n'
import { isReleaseDesktopBuild, shouldShowAuthDevHints } from '../../env/release-build'
import { useAuthBuildProfile } from '../../features/user/useAuthBuildProfile'
import { useAuthProviderConfig } from '../../features/user/useAuthProviderConfig'
import { inferDefaultAuthRegion } from '../../features/user/user-account-utils'
import type { ViewMode } from './types'
import { createUserCenterAuthActions } from './useUserCenterAuthActions'
import { isCnEmailAccountInput } from './useUserCenterAuthLabels'

export {
  cnPrimaryActionLabel,
  isCnEmailAccountInput,
  viewSubtitle,
  viewTitle,
} from './useUserCenterAuthLabels'

export function useUserCenterAuth(options: {
  open: boolean
  view: ViewMode
  onAuthComplete: () => void
}) {
  const { open, view, onAuthComplete } = options
  const { t } = useI18n()
  const { profile, loading: profileLoading } = useAuthBuildProfile()
  const {
    loading: providerConfigLoading,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
    douyinConfigured,
  } = useAuthProviderConfig()

  const [region, setRegion] = useState<AuthRegion>(() => inferDefaultAuthRegion())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [account, setAccount] = useState('')
  const [otpChannel, setOtpChannel] = useState<AuthOtpChannel | null>(null)
  const [otpExpiresMinutes, setOtpExpiresMinutes] = useState(2)
  const [smsCode, setSmsCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [devHint, setDevHint] = useState<string | null>(null)
  const [mergeState, setMergeState] = useState<{
    mergeToken: string
    maskedPhone: string
    wechatLabel: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPackagedApp, setIsPackagedApp] = useState(isReleaseDesktopBuild())

  useEffect(() => {
    void window.api.invoke(IpcChannel.AppGetInfo).then((result) => {
      const data = result?.ok ? (result.data as { isPackaged?: boolean }) : null
      if (typeof data?.isPackaged === 'boolean') {
        setIsPackagedApp(data.isPackaged)
      }
    })
  }, [])

  useEffect(() => {
    if (!open || profileLoading || providerConfigLoading || !firebaseConfigured) return

    let cancelled = false
    void consumeFirebaseRedirectLogin()
      .then(async (redirectResult) => {
        if (cancelled || !redirectResult) return
        setBusy(true)
        setError(null)
        await loginAuth({
          region: 'intl',
          method: redirectResult.provider,
          payload: { idToken: redirectResult.idToken },
        })
        onAuthComplete()
      })
      .catch((redirectError) => {
        if (cancelled) return
        setError(formatFirebaseAuthError(redirectError))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, profileLoading, providerConfigLoading, firebaseConfigured, onAuthComplete])

  useEffect(() => {
    if (smsCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setSmsCooldown((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [smsCooldown])

  useEffect(() => {
    if (!profile) return
    setRegion(inferDefaultAuthRegion(profile))
  }, [profile])

  useEffect(() => {
    if (!open) return
    setError(null)
    setDevHint(null)
    setMergeState(null)
    setSmsCode('')
    setPassword('')
    setConfirmPassword('')
    setOtpChannel(null)
    setSmsCooldown(0)
  }, [open, view])

  const showCnAuth =
    view !== 'profile' &&
    (view === 'forgot_password'
      ? region === 'cn' && (profile ? profile.cnAuthEnabled : true)
      : profile
        ? profile.cnAuthEnabled
        : region === 'cn')
  const showIntlAuth =
    view !== 'profile' &&
    (view === 'forgot_password'
      ? region === 'intl' && (profile ? profile.intlAuthEnabled : true)
      : profile
        ? profile.intlAuthEnabled && !profile.cnAuthEnabled
        : region === 'intl')
  const authBusy = busy || profileLoading || providerConfigLoading
  const cnAccountIsEmail = isCnEmailAccountInput(account)

  const showDevAuthHints = shouldShowAuthDevHints(isPackagedApp)

  const firebaseConfigHint = showDevAuthHints
    ? t('user.auth.configFirebase')
    : t('user.auth.configFirebaseRelease')

  const cnConfigHint = showDevAuthHints
    ? t('user.auth.configCn')
    : t('user.auth.configCnRelease')

  const codeIntent =
    view === 'register' ? 'register' : view === 'forgot_password' ? 'reset' : 'login'

  const resetFormFields = () => {
    setSmsCode('')
    setPassword('')
    setConfirmPassword('')
    setOtpChannel(null)
    setError(null)
    setDevHint(null)
  }

  const { sendVerificationCode, submitResetPassword, submit } = useMemo(
    () =>
      createUserCenterAuthActions({
        view,
        region,
        email,
        password,
        confirmPassword,
        account,
        smsCode,
        cnAccountIsEmail,
        mergeState,
        codeIntent,
        t,
        onAuthComplete,
        setBusy,
        setError,
        setSendingCode,
        setOtpChannel,
        setOtpExpiresMinutes,
        setSmsCooldown,
        setDevHint,
        setMergeState,
        resetFormFields,
      }),
    [
      view,
      region,
      email,
      password,
      confirmPassword,
      account,
      smsCode,
      cnAccountIsEmail,
      mergeState,
      codeIntent,
      t,
      onAuthComplete,
    ],
  )

  return {
    profile,
    profileLoading,
    providerConfigLoading,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
    douyinConfigured,
    region,
    setRegion,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    account,
    setAccount,
    otpChannel,
    setOtpChannel,
    otpExpiresMinutes,
    smsCode,
    setSmsCode,
    smsCooldown,
    sendingCode,
    devHint,
    setDevHint,
    mergeState,
    setMergeState,
    busy,
    error,
    setError,
    showIntlAuth,
    showCnAuth,
    authBusy,
    cnAccountIsEmail,
    firebaseConfigHint,
    cnConfigHint,
    sendVerificationCode,
    submitResetPassword,
    submit,
    resetFormFields,
  }
}
