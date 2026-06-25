import type { AuthProvider } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

const SOCIAL_OAUTH_LOGIN_ENABLED = false

function WechatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.17 1.161 4.095 2.972 5.43L2.048 19.2l3.72-1.237c.987.275 2.035.423 3.123.423.3 0 .595-.014.885-.041a6.64 6.64 0 0 1-.254-1.844c0-3.66 3.542-6.627 7.912-6.627.396 0 .784.028 1.162.082C16.735 4.787 12.853 2.188 8.691 2.188zm-2.93 4.066c.578 0 1.046.468 1.046 1.045a1.044 1.044 0 0 1-1.046 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.468-1.045 1.045-1.045zm5.859 0c.578 0 1.045.468 1.045 1.045a1.044 1.044 0 0 1-1.045 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.467-1.045 1.045-1.045zM15.691 10.5c-4.136 0-7.487 2.873-7.487 6.417 0 2.078 1.101 3.937 2.83 5.17l-.735 2.204 2.415-.803c.822.228 1.69.352 2.592.352 4.136 0 7.487-2.873 7.487-6.417S19.827 10.5 15.691 10.5zm-2.992 3.416a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744zm5.984 0a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744z"
      />
    </svg>
  )
}

function DouyinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.85 4.85 0 0 1-1-.48z"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  )
}

const SOCIAL_ITEMS: Array<{
  provider: AuthProvider
  icon: 'wechat' | 'douyin' | 'google' | 'apple'
}> = [
  { provider: 'tencent_wechat', icon: 'wechat' },
  { provider: 'tencent_douyin', icon: 'douyin' },
  { provider: 'firebase_google', icon: 'google' },
  { provider: 'firebase_apple', icon: 'apple' },
]

function renderIcon(icon: (typeof SOCIAL_ITEMS)[number]['icon']) {
  switch (icon) {
    case 'wechat':
      return <WechatIcon />
    case 'douyin':
      return <DouyinIcon />
    case 'google':
      return <GoogleIcon />
    case 'apple':
      return <AppleIcon />
  }
}

interface SocialIconGridProps {
  disabled?: boolean
  firebaseConfigured: boolean
  wechatConfigured: boolean
  douyinConfigured: boolean
  onSelect: (provider: AuthProvider) => void
}

export function SocialIconGrid({
  disabled,
  firebaseConfigured,
  wechatConfigured,
  douyinConfigured,
  onSelect,
}: SocialIconGridProps) {
  const { t } = useI18n()
  const items = SOCIAL_ITEMS.map((item) => ({
    ...item,
    label: t(`user.labels.providers.${item.provider}`),
  }))

  const isProviderAvailable = (provider: AuthProvider) => {
    switch (provider) {
      case 'tencent_wechat':
        return SOCIAL_OAUTH_LOGIN_ENABLED && wechatConfigured
      case 'tencent_douyin':
        return SOCIAL_OAUTH_LOGIN_ENABLED && douyinConfigured
      case 'firebase_google':
      case 'firebase_apple':
        return firebaseConfigured
      default:
        return false
    }
  }

  return (
    <div className="tm-user-center-social">
      <div className="tm-user-center-social-divider" aria-hidden="true">
        <span>{t('user.auth.socialDivider')}</span>
      </div>
      <div className="tm-user-center-social-grid" role="group" aria-label={t('user.auth.socialAria')}>
        {items.map((item) => {
          const available = isProviderAvailable(item.provider)
          const unavailable = !available
          return (
            <button
              key={item.provider}
              type="button"
              className={[
                'tm-user-center-social-btn',
                `tm-user-center-social-btn--${item.icon}`,
                unavailable ? 'tm-user-center-social-btn--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={disabled || unavailable}
              title={unavailable ? t('common.unavailable') : item.label}
              aria-label={item.label}
              onClick={() => onSelect(item.provider)}
            >
              {renderIcon(item.icon)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
