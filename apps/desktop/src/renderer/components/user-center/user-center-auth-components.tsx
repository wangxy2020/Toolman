import type { ReactNode } from 'react'

import { SocialIconGrid } from './SocialIconGrid'
import type { ViewMode } from './types'
import { cnPrimaryActionLabel, type useUserCenterAuth } from './useUserCenterAuth'
import { useI18n } from '../../i18n/useI18n'

export function AuthTextInput({
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

export function useAuthViewRenderers(
  view: ViewMode,
  auth: ReturnType<typeof useUserCenterAuth>,
) {
  const { t } = useI18n()
  const {
    authBusy,
    phoneConfigured,
    account,
    smsCode,
    setSmsCode,
    sendingCode,
    smsCooldown,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    sendVerificationCode,
    firebaseConfigured,
    wechatConfigured,
    douyinConfigured,
    submit,
  } = auth

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
        <AuthTextInput
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
          <AuthTextInput
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

  const renderAuthPrimary = (fields: ReactNode, submitButton: ReactNode) => (
    <div className="tm-user-center-auth-primary">
      <div className="tm-user-center-auth-fields">{fields}</div>
      <div className="tm-user-center-auth-actions">
        {submitButton}
        {renderSocial()}
      </div>
    </div>
  )

  return {
    t,
    renderCodeRow,
    renderPasswordFields,
    renderAuthPrimary,
    cnPrimaryActionLabel: (accountValue: string) => cnPrimaryActionLabel(view, accountValue, t),
  }
}
