import { useEffect, useState } from 'react'

import type { AuthOtpChannel, AuthProvider, AuthRegion } from '@toolman/shared'

import {
  AuthMergeRequiredError,
  loginAuth,
  resetAuthPassword,
  sendAuthSmsCode,
} from '../../features/user/auth-api.client'
import {
  consumeFirebaseRedirectLogin,
  formatFirebaseAuthError,
  signInWithFirebaseOAuth,
} from '../../features/user/firebase-auth.client'
import { useAuthBuildProfile } from '../../features/user/useAuthBuildProfile'
import { useAuthProviderConfig } from '../../features/user/useAuthProviderConfig'
import { inferDefaultAuthRegion } from '../../features/user/user-account-utils'
import type { ViewMode } from './types'

export function isCnEmailAccountInput(value: string): boolean {
  return value.trim().includes('@')
}

export function cnPrimaryActionLabel(view: ViewMode, account: string): string {
  if (view === 'register') {
    return isCnEmailAccountInput(account) ? '邮箱注册' : '手机号注册'
  }
  return isCnEmailAccountInput(account) ? '邮箱登录' : '手机号登录'
}

export function viewTitle(view: ViewMode): string {
  switch (view) {
    case 'register':
      return '注册 Toolman 账户'
    case 'forgot_password':
      return '找回密码'
    case 'profile':
      return '账户中心'
    default:
      return '登录 Toolman 账户'
  }
}

export function viewSubtitle(view: ViewMode): string {
  switch (view) {
    case 'register':
      return '使用手机号或邮箱注册，验证码验证后即可完成。'
    case 'forgot_password':
      return '通过注册手机号或邮箱接收验证码，设置新密码。'
    case 'profile':
      return '管理个人资料、安全绑定与账户设置。'
    default:
      return '加入我们，解锁全部功能，你的电脑将如虎添翼。'
  }
}

export function useUserCenterAuth(options: {
  open: boolean
  view: ViewMode
  onAuthComplete: () => void
}) {
  const { open, view, onAuthComplete } = options
  const { profile, loading: profileLoading } = useAuthBuildProfile()
  const {
    loading: providerConfigLoading,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
    douyinConfigured,
    tencent,
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

  useEffect(() => {
    if (!open || profileLoading || providerConfigLoading) return

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
  }, [open, profileLoading, providerConfigLoading, onAuthComplete])

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
    (view === 'forgot_password' ||
      (profile ? profile.cnAuthEnabled : region === 'cn'))
  const showIntlAuth =
    view !== 'profile' &&
    view !== 'forgot_password' &&
    (profile ? profile.intlAuthEnabled && !profile.cnAuthEnabled : region === 'intl')
  const authBusy = busy || profileLoading || providerConfigLoading
  const cnAccountIsEmail = isCnEmailAccountInput(account)

  const firebaseConfigHint =
    '国际登录未配置。请在项目根目录创建 `.env.local`（可参考 `.env.example`），设置 TOOLMAN_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID 后重启应用。'

  const cnConfigHint =
    tencent?.configured === true && tencent.authingEnabled
      ? '国内登录未配置。请在 `.env.local` 设置 TOOLMAN_AUTHING_APP_ID / TOOLMAN_AUTHING_APP_HOST / TOOLMAN_AUTHING_APP_SECRET 后重启应用。'
      : '国内登录未配置。请在 `.env.local` 设置 TOOLMAN_AUTHING_*（推荐）或 TOOLMAN_TENCENT_* / TOOLMAN_WECHAT_* 后重启应用。'

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

  const sendVerificationCode = async () => {
    setSendingCode(true)
    setError(null)
    try {
      const result = await sendAuthSmsCode({
        account: account.trim(),
        region: 'cn',
        intent: codeIntent,
      })
      setOtpChannel(result.channel)
      setOtpExpiresMinutes(Math.max(1, Math.round((result.expiresInSeconds ?? 120) / 60)))
      setSmsCooldown(result.retryAfterSeconds)
      setDevHint(result.devHint ?? null)
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '验证码发送失败'
      setError(message)
    } finally {
      setSendingCode(false)
    }
  }

  const submitResetPassword = async () => {
    setBusy(true)
    setError(null)
    try {
      await resetAuthPassword({
        region: 'cn',
        account: account.trim(),
        code: smsCode.trim(),
        password,
        confirmPassword,
      })
      resetFormFields()
      setDevHint('密码已重置，请使用新密码登录。')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '重置密码失败')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (method: AuthProvider) => {
    setBusy(true)
    setError(null)
    try {
      if (method === 'firebase_google' || method === 'firebase_apple') {
        const idToken = await signInWithFirebaseOAuth(method)
        await loginAuth({
          region: 'intl',
          method,
          payload: { idToken },
        })
      } else if (method === 'tencent_wechat' && mergeState) {
        await loginAuth({
          region: 'cn',
          method: 'tencent_wechat',
          payload: {
            mergeToken: mergeState.mergeToken,
            phone: account.trim(),
            code: smsCode.trim(),
          },
        })
      } else {
        const intent = view === 'register' ? 'register' : 'login'
        await loginAuth({
          region,
          method,
          payload:
            method === 'firebase_email'
              ? { email: email.trim(), password, intent }
              : method === 'tencent_phone'
                ? view === 'register'
                  ? {
                      account: account.trim(),
                      code: smsCode.trim(),
                      password,
                      confirmPassword,
                      intent: 'register' as const,
                    }
                  : cnAccountIsEmail
                    ? { account: account.trim(), password, intent: 'login' as const }
                    : { account: account.trim(), code: smsCode.trim(), intent: 'login' as const }
                : undefined,
        })
      }
      onAuthComplete()
    } catch (submitError) {
      if (submitError instanceof AuthMergeRequiredError) {
        setMergeState(submitError.details)
        setError(null)
        return
      }
      const message =
        submitError instanceof Error ? formatFirebaseAuthError(submitError) : '登录失败'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

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
