import type { ReactNode } from 'react'

import type { ViewMode } from './types'
import { AuthTextInput, useAuthViewRenderers } from './user-center-auth-components'
import type { useUserCenterAuth } from './useUserCenterAuth'

export function UserCenterAuthIntlBody({
  view,
  auth,
}: {
  view: ViewMode
  auth: ReturnType<typeof useUserCenterAuth>
}) {
  const {
    authBusy,
    firebaseConfigured,
    email,
    setEmail,
    password,
    confirmPassword,
    devHint,
    submitResetPassword,
    submit,
    setError,
  } = auth
  const { t, renderPasswordFields, renderAuthPrimary } = useAuthViewRenderers(view, auth)

  if (view === 'forgot_password') {
    return (
      <div className="tm-auth-entry-form">
        <AuthTextInput
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
          <p className="tm-auth-entry-section-desc">{t('user.auth.firebaseResetHint')}</p>
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
  }

  const isRegister = view === 'register'

  return renderAuthPrimary(
    <>
      <AuthTextInput
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
          setError(t('user.auth.passwordMismatch'))
          return
        }
        void submit('firebase_email')
      }}
    >
      {isRegister ? t('user.auth.registerEmail') : t('user.auth.loginEmail')}
    </button>,
  )
}

export function UserCenterAuthIntlConfigHint({
  auth,
}: {
  auth: ReturnType<typeof useUserCenterAuth>
}): ReactNode {
  const { firebaseConfigured, firebaseConfigHint } = auth
  if (firebaseConfigured) return null
  return <p className="tm-auth-entry-dev-hint">{firebaseConfigHint}</p>
}
