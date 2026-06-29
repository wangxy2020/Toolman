import type { ViewMode } from './types'
import type { useUserCenterAuth } from './useUserCenterAuth'
import { useI18n } from '../../i18n/useI18n'

export function UserCenterAuthFooter({
  view,
  auth,
  onSwitchView,
}: {
  view: ViewMode
  auth: ReturnType<typeof useUserCenterAuth>
  onSwitchView: (view: ViewMode) => void
}) {
  const { t } = useI18n()
  const {
    authBusy,
    showCnAuth,
    cnAccountIsEmail,
    region,
    setRegion,
    resetFormFields,
  } = auth

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
        ) : auth.showIntlAuth || region === 'intl' ? (
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
