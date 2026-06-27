import { useEffect, useState } from 'react'

import {
  resolveUserTypeLabel,
} from '../../features/user/user-account-utils'
import type { useUserAccount } from '../../features/user/useUserAccount'
import { formatAccountStatusLabel, formatBindingSummary } from '../../features/user/user-account-utils'
import { getAvatarFallbackLabel, shortenId } from '../../features/user/user-avatar-utils'
import { useI18n } from '../../i18n/useI18n'

interface UserCenterLocalPanelProps {
  account: ReturnType<typeof useUserAccount>
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" strokeLinecap="round" />
      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ComputerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 20h8M12 18v2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="tm-user-center-device-chevron"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusBadges({
  label,
  isLoggedIn,
  isRegisteredLoggedOut,
}: {
  label: string
  isLoggedIn: boolean
  isRegisteredLoggedOut: boolean
}) {
  const parts = label.split(' · ').filter(Boolean)
  return (
    <div className="tm-user-center-status-badges">
      {parts.map((part, i) => (
        <span
          key={part}
          className={[
            'tm-user-center-status-badge',
            i === parts.length - 1 && isLoggedIn ? 'tm-user-center-status-badge--active' : '',
            i === parts.length - 1 && isRegisteredLoggedOut ? 'tm-user-center-status-badge--warn' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {part}
        </span>
      ))}
    </div>
  )
}

export function UserCenterLocalPanel({ account }: UserCenterLocalPanelProps) {
  const { t } = useI18n()
  const identity = account.identity
  const authSession = account.authSession
  const community = account.communityProfile
  const device = identity?.device

  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (identity?.displayName) setDisplayName(identity.displayName.slice(0, 10))
  }, [identity?.displayName])

  const avatarFallback = getAvatarFallbackLabel({ avatarUrl: identity?.avatarUrl })
  const statusLabel = formatAccountStatusLabel(authSession, t)
  const isLoggedIn = !!authSession?.isLoggedIn
  const isRegisteredLoggedOut =
    authSession?.registrationStatus === 'registered' && authSession.isLoggedIn === false
  const visibleBindings =
    authSession?.isLoggedIn && authSession.bindings.length > 0 ? authSession.bindings : []
  const userTypeLabel = resolveUserTypeLabel(authSession, community?.role, t)

  const saveDisplayName = () => {
    const trimmed = displayName.trim()
    if (!trimmed) return
    const current = identity?.displayName?.slice(0, 10) ?? ''
    if (trimmed === current) return
    void account.saveDisplayName(trimmed).catch(() => undefined)
  }

  const pickAvatar = () => {
    void account.pickAvatar().catch(() => undefined)
  }

  return (
    <div className="tm-user-center-local-panel">
      <section className="tm-user-center-profile-identity">
        <div className="tm-user-center-profile-header">
          <button
            type="button"
            className="tm-nav-avatar tm-user-center-profile-avatar-btn"
            aria-label={t('user.profile.changeAvatar')}
            disabled={account.saving}
            onClick={pickAvatar}
          >
            {identity?.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" className="tm-nav-avatar-image" />
            ) : (
              avatarFallback
            )}
          </button>
          <div className="tm-user-center-profile-meta">
            <div className="tm-user-center-profile-name-row">
              <h3 className="tm-user-center-profile-name">
                {identity?.displayName ?? t('user.profile.localUser')}
              </h3>
              <button
                type="button"
                className="tm-user-center-icon-btn tm-user-center-icon-btn--ghost"
                aria-label={t('user.profile.refreshAccount')}
                disabled={account.loading}
                onClick={() => void account.load().catch(() => undefined)}
              >
                {account.loading ? <span className="tm-user-center-spinner" /> : <RefreshIcon />}
              </button>
            </div>
            <StatusBadges
              label={statusLabel}
              isLoggedIn={isLoggedIn}
              isRegisteredLoggedOut={isRegisteredLoggedOut}
            />
            <div className="tm-user-center-profile-tags">
              <span className="tm-user-center-profile-tag tm-user-center-profile-tag--accent">
                {userTypeLabel}
              </span>
            </div>
            {visibleBindings.length ? (
              <div className="tm-user-center-profile-bindings">
                {visibleBindings.map((binding) => (
                  <span
                    key={`${binding.provider}-${binding.subjectId}`}
                    className="tm-user-center-profile-binding"
                    title={formatBindingSummary(binding, t)}
                  >
                    {formatBindingSummary(binding, t)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {account.error ? (
        <div className="tm-user-center-alert tm-user-center-alert--error" role="alert">
          {account.error}
        </div>
      ) : null}
      {account.hubOnline === false ? (
        <div className="tm-user-center-alert tm-user-center-alert--warning">
          {t('user.profile.hubOffline')}
        </div>
      ) : null}

      <section className="tm-user-center-local-settings">
        <div className="tm-user-center-display-name-box">
          <label className="tm-user-center-display-name-row">
            <span className="tm-user-center-display-name-label">{t('user.profile.displayName')}</span>
            <div className="tm-user-center-display-name-input-wrap">
              <input
                className="tm-user-center-display-name-input"
                type="text"
                value={displayName}
                maxLength={10}
                disabled={account.saving}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveDisplayName()
                }}
                onBlur={saveDisplayName}
              />
            </div>
          </label>
        </div>

        <details className="tm-user-center-device">
          <summary className="tm-user-center-device-summary">
            <ComputerIcon />
            <span className="tm-user-center-device-name">
              {device?.deviceName ?? t('user.profile.loadingDevice')}
            </span>
            <ChevronIcon />
          </summary>
          {device ? (
            <dl className="tm-user-center-device-body">
              <DeviceMetaRow label={t('user.profile.deviceId')} value={device.deviceId} />
              <DeviceMetaRow label={t('user.profile.identityId')} value={device.identityId} />
              <DeviceMetaRow label={t('user.profile.deviceFingerprint')} value={device.publicKeyFingerprint} shorten />
            </dl>
          ) : null}
        </details>
      </section>
    </div>
  )
}

function DeviceMetaRow({
  label,
  value,
  shorten,
}: {
  label: string
  value: string
  shorten?: boolean
}) {
  const display = shorten ? shortenId(value, 10, 6) : shortenId(value)
  return (
    <div className="tm-user-center-device-item">
      <dt>{label}</dt>
      <dd title={value}>{display}</dd>
    </div>
  )
}
