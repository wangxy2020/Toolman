import type { ReactNode } from 'react'

import { SocialIconGrid } from './SocialIconGrid'
import type { ViewMode } from './types'
import {
  cnPrimaryActionLabel,
  type useUserCenterAuth,
} from './useUserCenterAuth'

function TextInput({
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
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

interface UserCenterAuthViewsProps {
  view: ViewMode
  auth: ReturnType<typeof useUserCenterAuth>
  onSwitchView: (view: ViewMode) => void
}

export function UserCenterAuthViews({ view, auth, onSwitchView }: UserCenterAuthViewsProps) {
  const {
    profileLoading,
    providerConfigLoading,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
    douyinConfigured,
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
    mergeState,
    setMergeState,
    authBusy,
    cnAccountIsEmail,
    firebaseConfigHint,
    cnConfigHint,
    showIntlAuth,
    showCnAuth,
    sendVerificationCode,
    submitResetPassword,
    submit,
    resetFormFields,
  } = auth

  if (profileLoading || providerConfigLoading) {
    return <p className="tm-user-center-loading">正在加载登录配置…</p>
  }

  const renderCodeRow = () => (
    <div className="tm-user-center-otp-box">
      <div className="tm-user-center-otp-row">
        <input
          className="tm-user-center-otp-input"
          type="text"
          inputMode="numeric"
          placeholder="请输入验证码"
          value={smsCode}
          disabled={authBusy}
          onChange={(e) => setSmsCode(e.target.value)}
        />
        <button
          type="button"
          className="tm-user-center-otp-sms-btn"
          disabled={authBusy || sendingCode || !phoneConfigured || !account.trim() || smsCooldown > 0}
          onClick={() => void sendVerificationCode()}
        >
          {sendingCode ? '发送中…' : smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
        </button>
      </div>
    </div>
  )

  const renderPasswordFields = (options?: { includeConfirm?: boolean; newPasswordOnly?: boolean }) => {
    const includeConfirm = options?.includeConfirm ?? false
    const newPasswordOnly = options?.newPasswordOnly ?? false
    return (
      <>
        <TextInput
          type="password"
          autoComplete={newPasswordOnly || view === 'register' ? 'new-password' : 'current-password'}
          placeholder={newPasswordOnly ? '请输入新密码' : '请输入密码'}
          value={password}
          disabled={authBusy || !phoneConfigured}
          onChange={setPassword}
        />
        {includeConfirm ? (
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder="请再次输入密码"
            value={confirmPassword}
            disabled={authBusy || !phoneConfigured}
            onChange={setConfirmPassword}
          />
        ) : null}
      </>
    )
  }

  const renderSocial = () => (
    <SocialIconGrid
      disabled={authBusy}
      firebaseConfigured={firebaseConfigured}
      wechatConfigured={wechatConfigured}
      douyinConfigured={douyinConfigured}
      onSelect={(provider) => void submit(provider)}
    />
  )

  const renderAuthPrimary = (fields: ReactNode, submit: ReactNode) => (
    <div className="tm-user-center-auth-primary">
      <div className="tm-user-center-auth-fields">{fields}</div>
      <div className="tm-user-center-auth-actions">
        {submit}
        {renderSocial()}
      </div>
    </div>
  )

  let configHint: ReactNode = null
  let body: ReactNode = null

  if (showIntlAuth) {
    configHint = !firebaseConfigured ? (
      <p className="tm-auth-entry-dev-hint">{firebaseConfigHint}</p>
    ) : null

    const isRegister = view === 'register'

    body = renderAuthPrimary(
      <>
        <TextInput
          type="email"
          autoComplete="email"
          placeholder="请输入邮箱"
          value={email}
          disabled={authBusy || !firebaseConfigured}
          onChange={setEmail}
        />
        {renderPasswordFields({ includeConfirm: isRegister })}
      </>,
      <button
        type="button"
        className="tm-auth-entry-submit-btn"
        disabled={
          authBusy ||
          !firebaseConfigured ||
          !email.trim() ||
          !password.trim() ||
          (isRegister && !confirmPassword.trim())
        }
        onClick={() => {
          if (isRegister && password !== confirmPassword) {
            auth.setError('两次输入的密码不一致')
            return
          }
          void submit('firebase_email')
        }}
      >
        {isRegister ? '邮箱注册' : '邮箱登录'}
      </button>,
    )
  } else if (showCnAuth && mergeState) {
    body = (
      <>
        <p className="tm-auth-entry-section-desc">
          微信账户「{mergeState.wechatLabel}」需要与本机手机号账户（{mergeState.maskedPhone}）合并。
        </p>
        <div className="tm-auth-entry-form">
          <div className="tm-auth-entry-phone-field">
            <input
              className="tm-auth-entry-input tm-auth-entry-input--plain"
              type="tel"
              inputMode="tel"
              placeholder={mergeState.maskedPhone}
              value={account}
              disabled={authBusy}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>
          {renderCodeRow()}
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !account.trim() || !smsCode.trim()}
            onClick={() => void submit('tencent_wechat')}
          >
            验证并合并登录
          </button>
          <button
            type="button"
            className="tm-user-center-text-link"
            disabled={authBusy}
            onClick={() => {
              setMergeState(null)
              setAccount('')
              setSmsCode('')
              setOtpChannel(null)
            }}
          >
            取消合并
          </button>
        </div>
      </>
    )
  } else if (showCnAuth) {
    configHint =
      !phoneConfigured && !wechatConfigured && !douyinConfigured ? (
        <p className="tm-auth-entry-dev-hint">{cnConfigHint}</p>
      ) : null

    const otpHint =
      otpChannel && view !== 'forgot_password' ? (
        <p className="tm-auth-entry-section-desc tm-auth-entry-section-desc--inline">
          验证码已发送至{otpChannel === 'email' ? '邮箱' : '手机'}，{otpExpiresMinutes} 分钟内有效。
        </p>
      ) : view === 'forgot_password' && otpChannel ? (
        <p className="tm-auth-entry-section-desc tm-auth-entry-section-desc--inline">
          验证码已发送至{cnAccountIsEmail ? '邮箱' : '手机'}，{otpExpiresMinutes} 分钟内有效。
        </p>
      ) : null

    if (view === 'forgot_password') {
      const resetReady =
        account.trim() && smsCode.trim() && password.trim() && confirmPassword.trim()
      body = (
        <div className="tm-auth-entry-form">
          <TextInput
            autoComplete="username"
            inputMode="email"
            placeholder="请输入注册手机或邮箱"
            value={account}
            disabled={authBusy || !phoneConfigured}
            onChange={(value) => {
              setAccount(value)
              setOtpChannel(null)
            }}
          />
          <div className="tm-auth-entry-otp-hint-slot" aria-live="polite">
            {otpHint}
          </div>
          {renderCodeRow()}
          {renderPasswordFields({ includeConfirm: true, newPasswordOnly: true })}
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !phoneConfigured || !resetReady}
            onClick={() => void submitResetPassword()}
          >
            重置密码
          </button>
        </div>
      )
    } else if (view === 'register') {
      const registerReady =
        account.trim() && smsCode.trim() && password.trim() && confirmPassword.trim()
      body = renderAuthPrimary(
        <>
          <TextInput
            autoComplete="username"
            inputMode="email"
            placeholder="请输入手机或邮箱"
            value={account}
            disabled={authBusy || !phoneConfigured}
            onChange={(value) => {
              setAccount(value)
              setOtpChannel(null)
            }}
          />
          <div className="tm-auth-entry-otp-hint-slot" aria-live="polite">
            {otpHint}
          </div>
          {renderCodeRow()}
          {renderPasswordFields({ includeConfirm: true })}
        </>,
        <button
          type="button"
          className="tm-auth-entry-submit-btn"
          disabled={authBusy || !phoneConfigured || !registerReady}
          onClick={() => {
            if (password !== confirmPassword) {
              auth.setError('两次输入的密码不一致')
              return
            }
            void submit('tencent_phone')
          }}
        >
          {cnPrimaryActionLabel(view, account)}
        </button>,
      )
    } else {
      const loginPhoneReady = account.trim() && smsCode.trim()
      const loginEmailReady = account.trim() && password.trim()
      body = renderAuthPrimary(
        <>
          <TextInput
            autoComplete="username"
            inputMode="email"
            placeholder="请输入手机或邮箱"
            value={account}
            disabled={authBusy || !phoneConfigured}
            onChange={(value) => {
              const nextIsEmail = value.includes('@')
              const prevIsEmail = cnAccountIsEmail
              setAccount(value)
              setOtpChannel(null)
              if (nextIsEmail !== prevIsEmail) {
                setSmsCode('')
                setPassword('')
              }
            }}
          />
          {cnAccountIsEmail ? (
            renderPasswordFields()
          ) : (
            <>
              <div className="tm-auth-entry-otp-hint-slot" aria-live="polite">
                {otpHint}
              </div>
              {renderCodeRow()}
            </>
          )}
        </>,
        <button
          type="button"
          className="tm-auth-entry-submit-btn"
          disabled={
            authBusy ||
            !phoneConfigured ||
            (cnAccountIsEmail ? !loginEmailReady : !loginPhoneReady)
          }
          onClick={() => void submit('tencent_phone')}
        >
          {cnPrimaryActionLabel(view, account)}
        </button>,
      )
    }
  } else {
    body = <p className="tm-auth-entry-section-desc">当前构建不支持所选登录区域。</p>
  }

  const footerLinks = () => {
    if (view === 'login') {
      return (
        <>
          <button
            type="button"
            className="tm-user-center-footer-link"
            disabled={authBusy}
            onClick={() => onSwitchView('register')}
          >
            没有账号？<span>立即注册</span>
          </button>
          {showCnAuth && cnAccountIsEmail ? (
            <button
              type="button"
              className="tm-user-center-footer-link"
              disabled={authBusy}
              onClick={() => {
                resetFormFields()
                onSwitchView('forgot_password')
              }}
            >
              忘记密码？
            </button>
          ) : showIntlAuth ? (
            <button
              type="button"
              className="tm-user-center-footer-link"
              disabled={authBusy}
              onClick={() => {
                resetFormFields()
                onSwitchView('forgot_password')
              }}
            >
              忘记密码？
            </button>
          ) : null}
        </>
      )
    }
    if (view === 'register') {
      return (
        <button
          type="button"
          className="tm-user-center-footer-link"
          disabled={authBusy}
          onClick={() => onSwitchView('login')}
        >
          已有账号？<span>立即登录</span>
        </button>
      )
    }
    if (view === 'forgot_password') {
      return (
        <button
          type="button"
          className="tm-user-center-footer-link"
          disabled={authBusy}
          onClick={() => {
            resetFormFields()
            onSwitchView('login')
          }}
        >
          返回登录
        </button>
      )
    }
    return null
  }

  return (
    <div className="tm-user-center-auth-views">
      <div className="tm-user-center-auth-views-main">
        <div className="tm-auth-entry-config-hint-slot">{configHint}</div>
        <div className="tm-user-center-auth-body">{body}</div>
      </div>
      <footer className="tm-user-center-footer">{footerLinks()}</footer>
    </div>
  )
}
