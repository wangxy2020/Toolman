import { useEffect, useState, type ReactNode } from 'react'

import type { AuthProvider, AuthRegion } from '@toolman/shared'

import { loginAuth, sendAuthSmsCode, AuthMergeRequiredError } from './auth-api.client'
import {
  consumeFirebaseRedirectLogin,
  formatFirebaseAuthError,
  signInWithFirebaseOAuth,
} from './firebase-auth.client'
import { useAuthBuildProfile } from './useAuthBuildProfile'
import { useAuthProviderConfig } from './useAuthProviderConfig'
import { inferDefaultAuthRegion } from './user-account-utils'

export type AuthEntryMode = 'login' | 'register'

interface Props {
  open: boolean
  mode: AuthEntryMode
  onClose: () => void
  onSuccess?: () => void
}

function methodLabel(provider: AuthProvider, mode: AuthEntryMode): string {
  switch (provider) {
    case 'firebase_email':
      return mode === 'register' ? '邮箱注册' : '邮箱登录'
    case 'firebase_google':
      return 'Google 登录'
    case 'firebase_apple':
      return 'Apple 登录'
    case 'tencent_phone':
      return mode === 'register' ? '手机号一键注册' : '手机号一键登录'
    case 'tencent_wechat':
      return '微信授权登录'
    default:
      return '继续'
  }
}

function regionTabLabel(region: AuthRegion, mode: AuthEntryMode): string {
  const suffix = mode === 'register' ? '注册' : '登录'
  return region === 'cn' ? `国内${suffix}` : `国际${suffix}`
}

function AuthEntryDivider() {
  return (
    <div className="tm-auth-entry-divider" aria-hidden="true">
      <span>或</span>
    </div>
  )
}

function AuthEntryWechatIcon() {
  return (
    <svg className="tm-auth-entry-wechat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.17 1.161 4.095 2.972 5.43L2.048 19.2l3.72-1.237c.987.275 2.035.423 3.123.423.3 0 .595-.014.885-.041a6.64 6.64 0 0 1-.254-1.844c0-3.66 3.542-6.627 7.912-6.627.396 0 .784.028 1.162.082C16.735 4.787 12.853 2.188 8.691 2.188zm-2.93 4.066c.578 0 1.046.468 1.046 1.045a1.044 1.044 0 0 1-1.046 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.468-1.045 1.045-1.045zm5.859 0c.578 0 1.045.468 1.045 1.045a1.044 1.044 0 0 1-1.045 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.467-1.045 1.045-1.045zM15.691 10.5c-4.136 0-7.487 2.873-7.487 6.417 0 2.078 1.101 3.937 2.83 5.17l-.735 2.204 2.415-.803c.822.228 1.69.352 2.592.352 4.136 0 7.487-2.873 7.487-6.417S19.827 10.5 15.691 10.5zm-2.992 3.416a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744zm5.984 0a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744z"
      />
    </svg>
  )
}

function AuthEntryTextInput({
  type = 'text',
  value,
  placeholder,
  disabled,
  autoComplete,
  inputMode,
  onChange,
}: {
  type?: string
  value: string
  placeholder: string
  disabled?: boolean
  autoComplete?: string
  inputMode?: 'tel' | 'numeric' | 'email'
  onChange: (value: string) => void
}) {
  return (
    <div className="tm-auth-entry-input-shell">
      <input
        className="tm-auth-entry-input"
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function AuthEntryCancelButton({
  disabled,
  onClick,
  label = '取消',
}: {
  disabled?: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button type="button" className="tm-auth-entry-cancel-btn" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
}

export function AuthEntryModal({ open, mode, onClose, onSuccess }: Props) {
  const { profile, loading: profileLoading } = useAuthBuildProfile()
  const {
    loading: providerConfigLoading,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
    tencent,
  } = useAuthProviderConfig()
  const [region, setRegion] = useState<AuthRegion>(() => inferDefaultAuthRegion())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
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
        onSuccess?.()
        onClose()
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
  }, [open, profileLoading, providerConfigLoading, onClose, onSuccess])

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

  const regionSwitchEnabled = profile?.regionSwitchEnabled ?? true
  const showIntlAuth = profile ? profile.intlAuthEnabled && region === 'intl' : region === 'intl'
  const showCnAuth = profile ? profile.cnAuthEnabled && region === 'cn' : region === 'cn'
  const authBusy = busy || profileLoading || providerConfigLoading

  const firebaseConfigHint =
    '国际登录未配置。请在项目根目录创建 `.env.local`（可参考 `.env.example`），设置 TOOLMAN_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID 后重启应用。'

  const wechatConfigHint =
    tencent?.configured && tencent.wechatDevMode
      ? '当前为微信开发模式，可直接体验授权流程。'
      : '微信登录未配置。请在 `.env.local` 设置 TOOLMAN_WECHAT_DEV_MODE=1（开发）或 TOOLMAN_WECHAT_OPEN_APP_ID / APP_SECRET（生产）后重启应用。'

  const phoneConfigHint =
    '手机号登录未配置。请在 `.env.local` 设置 TOOLMAN_TENCENT_SMS_DEV_MODE=1（开发验证码 123456）或 TOOLMAN_TENCENT_* 短信参数后重启应用。'

  const title = mode === 'register' ? '注册 Toolman 账户' : '登录 Toolman 账户'

  if (!open) return null

  const sendSms = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await sendAuthSmsCode({
        phone: phone.trim(),
        region: 'cn',
        intent: mode,
      })
      setSmsCooldown(result.retryAfterSeconds)
      setDevHint(result.devHint ?? null)
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : '验证码发送失败'
      setError(message)
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
            phone: phone.trim(),
            code: smsCode.trim(),
          },
        })
      } else {
        await loginAuth({
          region,
          method,
          payload:
            method === 'firebase_email'
              ? { email: email.trim(), password, intent: mode }
              : method === 'tencent_phone'
                ? { phone: phone.trim(), code: smsCode.trim() }
                : undefined,
        })
      }
      onSuccess?.()
      onClose()
    } catch (submitError) {
      if (submitError instanceof AuthMergeRequiredError) {
        setMergeState(submitError.details)
        setError(null)
        return
      }
      const message =
        submitError instanceof Error ? formatFirebaseAuthError(submitError) : '登录失败'
      if (message === '正在跳转到授权页面…') {
        setError(null)
        return
      }
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const renderCnPhoneField = (placeholder = '请输入手机号') => (
    <div className="tm-auth-entry-phone-field">
      <span className="tm-auth-entry-phone-prefix">+86</span>
      <input
        className="tm-auth-entry-input tm-auth-entry-input--plain"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        value={phone}
        disabled={authBusy}
        onChange={(event) => setPhone(event.target.value)}
      />
    </div>
  )

  const renderCodeRow = () => (
    <div className="tm-auth-entry-code-row">
      <div className="tm-auth-entry-input-shell tm-auth-entry-input-shell--grow">
        <input
          className="tm-auth-entry-input tm-auth-entry-input--plain"
          type="text"
          inputMode="numeric"
          placeholder="请输入验证码"
          value={smsCode}
          disabled={authBusy}
          onChange={(event) => setSmsCode(event.target.value)}
        />
      </div>
      <button
        type="button"
        className="tm-auth-entry-sms-btn"
        disabled={authBusy || !phoneConfigured || !phone.trim() || smsCooldown > 0}
        onClick={() => void sendSms()}
      >
        {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
      </button>
    </div>
  )

  let bodyContent: ReactNode

  if (profileLoading || providerConfigLoading) {
    bodyContent = <p className="tm-auth-entry-section-desc">正在加载登录配置…</p>
  } else if (showIntlAuth) {
    bodyContent = (
      <>
        {!firebaseConfigured ? (
          <p className="tm-auth-entry-dev-hint">{firebaseConfigHint}</p>
        ) : null}

        <div className="tm-auth-entry-form">
          <AuthEntryTextInput
            type="email"
            autoComplete="email"
            placeholder="请输入邮箱"
            value={email}
            disabled={authBusy || !firebaseConfigured}
            onChange={setEmail}
          />
          <AuthEntryTextInput
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="请输入密码"
            value={password}
            disabled={authBusy || !firebaseConfigured}
            onChange={setPassword}
          />
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !firebaseConfigured || !email.trim() || !password.trim()}
            onClick={() => void submit('firebase_email')}
          >
            {methodLabel('firebase_email', mode)}
          </button>
        </div>

        <AuthEntryDivider />

        <div className="tm-auth-entry-alt-actions">
          <div className="tm-auth-entry-provider-list">
            {(['firebase_google', 'firebase_apple'] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                className="tm-auth-entry-provider-btn"
                disabled={authBusy || !firebaseConfigured}
                title={!firebaseConfigured ? firebaseConfigHint : undefined}
                onClick={() => void submit(provider)}
              >
                {methodLabel(provider, mode)}
              </button>
            ))}
          </div>
          <AuthEntryCancelButton disabled={authBusy} onClick={onClose} />
        </div>
      </>
    )
  } else if (showCnAuth && mergeState) {
    bodyContent = (
      <>
        <p className="tm-auth-entry-section-desc">
          微信账户「{mergeState.wechatLabel}」需要与本机手机号账户（{mergeState.maskedPhone}）合并。
          请输入已绑定的手机号并完成验证码验证。
        </p>
        <div className="tm-auth-entry-form">
          {renderCnPhoneField(mergeState.maskedPhone)}
          {renderCodeRow()}
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !phone.trim() || !smsCode.trim()}
            onClick={() => void submit('tencent_wechat')}
          >
            验证并合并登录
          </button>
          <AuthEntryCancelButton
            disabled={authBusy}
            label="取消合并"
            onClick={() => {
              setMergeState(null)
              setPhone('')
              setSmsCode('')
            }}
          />
        </div>
      </>
    )
  } else if (showCnAuth) {
    bodyContent = (
      <>
        {!phoneConfigured ? <p className="tm-auth-entry-dev-hint">{phoneConfigHint}</p> : null}

        <div className="tm-auth-entry-form">
          {renderCnPhoneField()}
          {renderCodeRow()}
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !phoneConfigured || !phone.trim() || !smsCode.trim()}
            onClick={() => void submit('tencent_phone')}
          >
            {methodLabel('tencent_phone', mode)}
          </button>
        </div>

        <AuthEntryDivider />

        <div className="tm-auth-entry-alt-actions">
          {!wechatConfigured ? (
            <p className="tm-auth-entry-dev-hint">{wechatConfigHint}</p>
          ) : tencent?.configured && tencent.wechatDevMode ? (
            <p className="tm-auth-entry-dev-hint">{wechatConfigHint}</p>
          ) : null}
          <button
            type="button"
            className="tm-auth-entry-provider-btn tm-auth-entry-provider-btn--wechat"
            disabled={authBusy || !wechatConfigured}
            title={!wechatConfigured ? wechatConfigHint : undefined}
            onClick={() => void submit('tencent_wechat')}
          >
            <AuthEntryWechatIcon />
            {methodLabel('tencent_wechat', mode)}
          </button>
          <AuthEntryCancelButton disabled={authBusy} onClick={onClose} />
        </div>
      </>
    )
  } else {
    bodyContent = <p className="tm-auth-entry-section-desc">当前构建不支持所选登录区域。</p>
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--auth-entry" onClick={onClose}>
      <div
        className="tm-auth-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-entry-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tm-auth-entry-hero">
          <h2 id="auth-entry-title" className="tm-auth-entry-title">
            {title}
          </h2>
          <p className="tm-auth-entry-subtitle">
            加入我们，解锁全部功能，你的电脑将如虎添翼。
          </p>
        </div>

        {regionSwitchEnabled ? (
          <div className="tm-auth-entry-region-tabs" role="tablist" aria-label="登录区域">
            <button
              type="button"
              role="tab"
              aria-selected={region === 'cn'}
              className={['tm-auth-entry-region-tab', region === 'cn' ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              disabled={authBusy || !profile?.cnAuthEnabled}
              onClick={(event) => {
                event.stopPropagation()
                setRegion('cn')
              }}
            >
              {regionTabLabel('cn', mode)}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={region === 'intl'}
              className={['tm-auth-entry-region-tab', region === 'intl' ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              disabled={authBusy || !profile?.intlAuthEnabled}
              onClick={(event) => {
                event.stopPropagation()
                setRegion('intl')
              }}
            >
              {regionTabLabel('intl', mode)}
            </button>
          </div>
        ) : null}

        {error ? <div className="tm-auth-entry-error">{error}</div> : null}
        {devHint ? <div className="tm-auth-entry-dev-hint">{devHint}</div> : null}

        <div className="tm-auth-entry-body">{bodyContent}</div>
      </div>
    </div>
  )
}
