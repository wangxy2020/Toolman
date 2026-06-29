import type { ReactNode } from 'react'

import type { ViewMode } from './types'
import { AuthTextInput, useAuthViewRenderers } from './user-center-auth-components'
import type { useUserCenterAuth } from './useUserCenterAuth'

export function UserCenterAuthCnMergeBody({
  auth,
}: {
  auth: ReturnType<typeof useUserCenterAuth>
}) {
  const {
    authBusy,
    mergeState,
    account,
    setAccount,
    setMergeState,
    setSmsCode,
    setOtpChannel,
    submit,
  } = auth
  const { t, renderCodeRow } = useAuthViewRenderers('login', auth)

  if (!mergeState) return null

  return (
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
          disabled={authBusy || !account.trim() || !auth.smsCode.trim()}
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
}

export function UserCenterAuthCnBody({
  view,
  auth,
}: {
  view: ViewMode
  auth: ReturnType<typeof useUserCenterAuth>
}) {
  const {
    authBusy,
    phoneConfigured,
    account,
    setAccount,
    setOtpChannel,
    otpChannel,
    otpExpiresMinutes,
    smsCode,
    password,
    confirmPassword,
    cnAccountIsEmail,
    setSmsCode,
    setPassword,
    submitResetPassword,
    submit,
    setError,
  } = auth
  const { t, renderCodeRow, renderPasswordFields, renderAuthPrimary, cnPrimaryActionLabel } =
    useAuthViewRenderers(view, auth)

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
    return (
      <div className="tm-auth-entry-form">
        <AuthTextInput
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
  }

  if (view === 'register') {
    const registerReady =
      account.trim() && smsCode.trim() && password.trim() && confirmPassword.trim()
    return renderAuthPrimary(
      <>
        <AuthTextInput
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
            setError(t('user.auth.passwordMismatch'))
            return
          }
          void submit('tencent_phone')
        }}
      >
        {cnPrimaryActionLabel(account)}
      </button>,
    )
  }

  const loginPhoneReady = account.trim() && smsCode.trim()
  const loginEmailReady = account.trim() && password.trim()
  return renderAuthPrimary(
    <>
      <AuthTextInput
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
      {cnPrimaryActionLabel(account)}
    </button>,
  )
}

export function UserCenterAuthCnConfigHint({
  auth,
}: {
  auth: ReturnType<typeof useUserCenterAuth>
}): ReactNode {
  const { phoneConfigured, wechatConfigured, douyinConfigured, cnConfigHint } = auth
  if (phoneConfigured || wechatConfigured || douyinConfigured) return null
  return <p className="tm-auth-entry-dev-hint">{cnConfigHint}</p>
}
