import { useEffect, useState } from 'react'

import { isRegisteredAuthSession } from '@toolman/shared'

import { USER_ROLE_LABELS } from '../../features/community/community-user-utils'
import type { useUserAccount } from '../../features/user/useUserAccount'
import { formatAccountStatusLabel, formatBindingSummary } from '../../features/user/user-account-utils'
import { getAvatarFallbackLabel, shortenId } from '../../features/user/user-avatar-utils'
import { useP2pNetworkStatus } from '../../features/group/useP2pNetworkStatus'

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

function StatusBadges({ label }: { label: string }) {
  const parts = label.split(' · ').filter(Boolean)
  return (
    <div className="tm-user-center-status-badges">
      {parts.map((part, i) => (
        <span
          key={part}
          className={[
            'tm-user-center-status-badge',
            i === parts.length - 1 && part.includes('登录') ? 'tm-user-center-status-badge--active' : '',
            part.includes('未登录') ? 'tm-user-center-status-badge--warn' : '',
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
  const identity = account.identity
  const authSession = account.authSession
  const community = account.communityProfile
  const device = identity?.device
  const { snapshot: networkSnapshot } = useP2pNetworkStatus()

  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (identity?.displayName) setDisplayName(identity.displayName.slice(0, 10))
  }, [identity?.displayName])

  const avatarFallback = getAvatarFallbackLabel({ avatarUrl: identity?.avatarUrl })
  const statusLabel = formatAccountStatusLabel(authSession)
  const visibleBindings =
    authSession?.isLoggedIn && authSession.bindings.length > 0 ? authSession.bindings : []
  const communityRoleLabel =
    community && isRegisteredAuthSession(authSession ?? { registrationStatus: 'guest' })
      ? USER_ROLE_LABELS[community.role]
      : null

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
            aria-label="更换头像"
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
              <h3 className="tm-user-center-profile-name">{identity?.displayName ?? '本地用户'}</h3>
              <button
                type="button"
                className="tm-user-center-icon-btn tm-user-center-icon-btn--ghost"
                aria-label="刷新账户信息"
                disabled={account.loading}
                onClick={() => void account.load().catch(() => undefined)}
              >
                {account.loading ? <span className="tm-user-center-spinner" /> : <RefreshIcon />}
              </button>
            </div>
            <StatusBadges label={statusLabel} />
            {communityRoleLabel ? (
              <div className="tm-user-center-profile-tags">
                <span className="tm-user-center-profile-tag tm-user-center-profile-tag--accent">
                  {communityRoleLabel}
                </span>
              </div>
            ) : null}
            {visibleBindings.length ? (
              <div className="tm-user-center-profile-bindings">
                {visibleBindings.map((binding) => (
                  <span
                    key={`${binding.provider}-${binding.subjectId}`}
                    className="tm-user-center-profile-binding"
                    title={formatBindingSummary(binding)}
                  >
                    {formatBindingSummary(binding)}
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
          社区 Hub 未启动，部分功能不可用
        </div>
      ) : null}

      <section className="tm-user-center-local-settings">
        <div className="tm-user-center-display-name-box">
          <label className="tm-user-center-display-name-row">
            <span className="tm-user-center-display-name-label">显示名称</span>
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
            <span className="tm-user-center-device-name">{device?.deviceName ?? '正在加载设备…'}</span>
            <ChevronIcon />
          </summary>
          {device ? (
            <dl className="tm-user-center-device-body">
              <DeviceMetaRow label="设备 ID" value={device.deviceId} />
              <DeviceMetaRow label="身份 ID" value={device.identityId} />
              <DeviceMetaRow label="设备指纹" value={device.publicKeyFingerprint} shorten />
              {device.did ? <DeviceMetaRow label="DID" value={device.did} shorten /> : null}
              {networkSnapshot?.localPeerId ? (
                <DeviceMetaRow label="libp2p PeerId" value={networkSnapshot.localPeerId} shorten />
              ) : null}
              {networkSnapshot ? (
                <DeviceMetaRow
                  label="网络连接"
                  value={`libp2p ${networkSnapshot.libp2pPeerCount} · WebRTC ${networkSnapshot.webrtcConnectedPeers}`}
                />
              ) : null}
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
