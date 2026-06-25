import type { ReactNode } from 'react'

import { SocialIconGrid } from './SocialIconGrid'
import type { ViewMode } from './types'
import {
  cnPrimaryActionLabel,
  type useUserCenterAuth,
} from './useUserCenterAuth'
import { useI18n } from '../../i18n/useI18n'

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
  const { t } = useI18n()
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
    devHint,
    firebaseConfigHint,
    cnConfigHint,
    region,
    setRegion,
    showIntlAuth,
    showCnAuth,
    sendVerificationCode,
    submitResetPassword,
    submit,
    resetFormFields,
  } = auth

  if (profileLoading || providerConfigLoading) {
    return <p className="tm-user-center-loading">{t('user.auth.loadingConfig')}</p>
  }

  const renderCodeRow = () => (
    <div className="tm-user-center-otp-box">
      <div className="tm-user-center-otp-row">
        <input
          className="tm-user-center-otp-input"
          type="text"
          inputMode="numeric"
          placeholder={t('user.auth.placeholderCode')}
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
          {sendingCode ? t('user.auth.sendingCode') : smsCooldown > 0 ? `${smsCooldown}s` : t('user.auth.getCode')}
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
          placeholder={
            newPasswordOnly ? t('user.auth.placeholderNewPassword') : t('user.auth.placeholderPassword')
          }
          value={password}
          disabled={authBusy || !phoneConfigured}
          onChange={setPassword}
        />
        {includeConfirm ? (
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder={t('user.auth.placeholderConfirmPassword')}
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

    if (view === 'forgot_password') {
      body = (
        <div className="tm-auth-entry-form">
          <TextInput
            type="email"
            autoComplete="email"
            placeholder={t('user.auth.placeholderRegisterEmail')}
            value={email}
            disabled={authBusy || !firebaseConfigured}
            onChange={setEmail}
          />
          {devHint ? (
            <p className="tm-auth-entry-section-desc tm-auth-entry-section-desc--inline">{devHint}</p>
          ) : (
            <p className="tm-auth-entry-section-desc">
              {t('user.auth.firebaseResetHint')}
            </p>
          )}
          <button
            type="button"
            className="tm-auth-entry-submit-btn"
            disabled={authBusy || !firebaseConfigured || !email.trim()}
            onClick={() => void submitResetPassword()}
          >
            {t('user.auth.sendResetEmail')}
          </button>
        </div>
      )
    } else {
      const isRegister = view === 'register'

      body = renderAuthPrimary(
        <>
          <TextInput
            type="email"
            autoComplete="email"
            placeholder={t('user.auth.placeholderEmail')}
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
              auth.setError(t('user.auth.passwordMismatch'))
              return
            }
            void submit('firebase_email')
          }}
        >
          {isRegister ? t('user.auth.registerEmail') : t('user.auth.loginEmail')}
        </button>,
      )
    }
  } else if (showCnAuth && mergeState) {
    body = (
      <>
        <p className="tm-auth-entry-section-desc">
          {t('user.auth.mergeDescription', {
            wechat: mergeState.wechatLabel,
            phone: mergeState.maskedPhone,
          })}
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
            {t('user.auth.mergeConfirm')}
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
            {t('user.auth.mergeCancel')}
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
          {t('user.auth.otpSent', { minutes: otpExpiresMinutes })}
        </p>
      ) : view === 'forgot_password' && otpChannel ? (
        <p className="tm-auth-entry-section-desc tm-auth-entry-section-desc--inline">
          {t('user.auth.otpSent', { minutes: otpExpiresMinutes })}
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
            placeholder={t('user.auth.placeholderRegisterPhone')}
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
            {t('user.auth.resetPassword')}
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
            placeholder={t('user.auth.placeholderPhoneOrEmail')}
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
              auth.setError(t('user.auth.passwordMismatch'))
              return
            }
            void submit('tencent_phone')
          }}
        >
          {cnPrimaryActionLabel(view, account, t)}
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
            placeholder={t('user.auth.placeholderPhoneOrEmail')}
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
          {cnPrimaryActionLabel(view, account, t)}
        </button>,
      )
    }
  } else {
    body = <p className="tm-auth-entry-section-desc">{t('user.auth.unsupportedRegion')}</p>
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
            {t('user.auth.footerNoAccount')}<span>{t('user.auth.registerNow')}</span>
          </button>
          {showCnAuth && cnAccountIsEmail ? (
            <button
              type="button"
              className="tm-user-center-footer-link"
              disabled={authBusy}
              onClick={() => {
                setRegion('cn')
                resetFormFields()
                onSwitchView('forgot_password')
              }}
            >
              {t('user.auth.forgotPassword')}
            </button>
          ) : showIntlAuth || region === 'intl' ? (
            <button
              type="button"
              className="tm-user-center-footer-link"
              disabled={authBusy}
              onClick={() => {
                setRegion('intl')
                resetFormFields()
                onSwitchView('forgot_password')
              }}
            >
              {t('user.auth.forgotPassword')}
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
          {t('user.auth.footerHasAccount')}<span>{t('user.auth.loginNow')}</span>
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
          {t('user.auth.backToLogin')}
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
