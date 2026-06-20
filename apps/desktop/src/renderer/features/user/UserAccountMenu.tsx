import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { isRegisteredAuthSession, requiresDeleteReauth } from '@toolman/shared'
import type { IdentityDeviceSummary } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconRefresh } from '../../components/icons'
import { USER_ROLE_LABELS } from '../community/community-user-utils'
import { DeleteAccountReauthModal } from './DeleteAccountReauthModal'
import { AuthEntryModal, type AuthEntryMode } from './AuthEntryModal'
import { AuthBindModal } from './AuthBindModal'
import { useUserAccount } from './useUserAccount'
import { useAuthBuildProfile } from './useAuthBuildProfile'
import {
  formatAccountStatusLabel,
  formatBindingSummary,
  isRegisteredUser,
} from './user-account-utils'
import { getAvatarFallbackLabel, shortenId } from './user-avatar-utils'

function UserAccountDeviceIcon() {
  return (
    <svg className="tm-user-account-device-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9.75 17 9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"
      />
    </svg>
  )
}

function UserAccountDevicePanel({ device }: { device: IdentityDeviceSummary }) {
  return (
    <div className="tm-user-account-device-panel">
      <div className="tm-user-account-device-chip">
        <UserAccountDeviceIcon />
        <span className="tm-user-account-device-chip-name">{device.deviceName}</span>
      </div>
      <details className="tm-user-account-device-details">
        <summary className="tm-user-account-device-details-toggle">查看设备详情</summary>
        <dl className="tm-user-account-device-meta">
          <div className="tm-user-account-device-item">
            <dt>设备 ID</dt>
            <dd title={device.deviceId}>{shortenId(device.deviceId)}</dd>
          </div>
          <div className="tm-user-account-device-item">
            <dt>身份 ID</dt>
            <dd title={device.identityId}>{shortenId(device.identityId)}</dd>
          </div>
          <div className="tm-user-account-device-item">
            <dt>设备指纹</dt>
            <dd title={device.publicKeyFingerprint}>
              {shortenId(device.publicKeyFingerprint, 10, 6)}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  )
}

interface UserAccountPopoverProps {
  anchorEl: HTMLElement
  onClose: () => void
  account: ReturnType<typeof useUserAccount>
}

export function UserAccountPopover({ anchorEl, onClose, account }: UserAccountPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const { profile: authBuildProfile } = useAuthBuildProfile()
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode | null>(null)
  const [bindProvider, setBindProvider] = useState<'tencent_phone' | 'tencent_wechat' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteReauth, setShowDeleteReauth] = useState(false)

  const identity = account.identity
  const authSession = account.authSession
  const community = account.communityProfile
  const devices = identity ? [identity.device] : []
  const registered = isRegisteredUser(authSession)
  const hasPhoneBinding = authSession?.bindings.some((binding) => binding.provider === 'tencent_phone')
  const hasWechatBinding = authSession?.bindings.some((binding) => binding.provider === 'tencent_wechat')

  useEffect(() => {
    if (account.identity?.displayName) {
      setDisplayName(account.identity.displayName.slice(0, 10))
    }
  }, [account.identity?.displayName])

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect()
      const popover = popoverRef.current
      const width = popover?.offsetWidth ?? 320
      const height = popover?.offsetHeight ?? 420
      const gap = 10

      let left = rect.left
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))

      let top = rect.bottom + gap
      if (top + height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - height - gap)
      }

      setPosition({ top, left })
    }

    updatePosition()
    const popover = popoverRef.current
    const resizeObserver =
      popover && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updatePosition()
          })
        : null
    resizeObserver?.observe(popover!)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [
    anchorEl,
    account.loading,
    account.identity,
    account.communityProfile,
    account.authSession,
    devices.length,
    authEntryMode,
    showDeleteConfirm,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || anchorEl.contains(target)) return
      if (
        target instanceof Element &&
        target.closest('.tm-modal-overlay, .tm-confirm-dialog')
      ) {
        return
      }
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [anchorEl, onClose])

  const avatarFallback = getAvatarFallbackLabel({
    avatarUrl: identity?.avatarUrl,
  })

  const statusLabel = formatAccountStatusLabel(authSession)
  const communityRoleLabel =
    community && isRegisteredAuthSession(authSession ?? { registrationStatus: 'guest' })
      ? USER_ROLE_LABELS[community.role]
      : null

  const saveProfileChanges = () => {
    if (!displayName.trim()) return
    void account.saveDisplayName(displayName).catch(() => undefined)
  }

  return createPortal(
    <>
      <div
        ref={popoverRef}
        className="tm-user-account-popover"
        style={
          position
            ? { top: position.top, left: position.left }
            : { visibility: 'hidden', top: 0, left: 0 }
        }
        role="dialog"
        aria-modal="true"
        aria-label="用户账户"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-user-account-popover-header">
          <div className="tm-user-account-popover-header-main">
            <div
              className={[
                'tm-user-account-avatar',
                identity?.avatarUrl ? 'tm-user-account-avatar--photo' : 'tm-user-account-avatar--fallback',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {identity?.avatarUrl ? (
                <img src={identity.avatarUrl} alt="" className="tm-user-account-avatar-image" />
              ) : (
                avatarFallback
              )}
            </div>
            <div className="tm-user-account-popover-meta">
              <h4 className="tm-user-account-popover-name" title={identity?.displayName ?? '本地用户'}>
                {identity?.displayName ?? '本地用户'}
              </h4>
              <div className="tm-user-account-popover-meta-line">
                <span className="tm-user-account-popover-status" title={statusLabel}>
                  {statusLabel}
                </span>
                {communityRoleLabel ? (
                  <>
                    <span className="tm-user-account-popover-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="tm-user-account-popover-role" title={communityRoleLabel}>
                      {communityRoleLabel}
                    </span>
                  </>
                ) : null}
              </div>
              {authSession?.bindings && authSession.bindings.length > 0 ? (
                <div className="tm-user-account-binding-tags">
                  {authSession.bindings.map((binding) => {
                    const label = formatBindingSummary(binding)
                    return (
                      <span
                        key={`${binding.provider}-${binding.subjectId}`}
                        className="tm-user-account-binding-tag"
                        title={label}
                      >
                        {label}
                      </span>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="tm-user-account-popover-header-actions">
            <button
              type="button"
              className="tm-user-account-popover-header-btn tm-user-account-popover-header-btn--refresh"
              title="刷新账户信息"
              aria-label="刷新账户信息"
              disabled={account.loading}
              onClick={() => void account.load().catch(() => undefined)}
            >
              <IconRefresh size={15} className={account.loading ? 'tm-icon-spin' : undefined} />
            </button>
          </div>
        </header>

        {account.error ? <div className="tm-user-account-popover-error">{account.error}</div> : null}

        <div className="tm-user-account-auth-card">
          {!registered ? (
            <>
              <p className="tm-user-account-auth-card-desc">
                注册并登录后可使用群组、社区互动与资源安装。未注册无法使用群组和社区全部功能。
              </p>
              <div className="tm-user-account-auth-actions">
                <button
                  type="button"
                  className="tm-user-account-auth-btn tm-user-account-auth-btn--primary"
                  disabled={account.saving}
                  onClick={() => setAuthEntryMode('login')}
                >
                  登录
                </button>
                <button
                  type="button"
                  className="tm-user-account-auth-btn tm-user-account-auth-btn--secondary"
                  disabled={account.saving}
                  onClick={() => setAuthEntryMode('register')}
                >
                  注册
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="tm-user-account-auth-card-desc">
                {account.isLoggedIn
                  ? '你已登录，可使用社区版全部功能。'
                  : '账户已注册，请重新登录'}
              </p>
              <div className="tm-user-account-auth-actions">
                {!account.isLoggedIn ? (
                  <button
                    type="button"
                    className="tm-user-account-auth-btn tm-user-account-auth-btn--primary tm-user-account-auth-btn--wide"
                    disabled={account.saving}
                    onClick={() => setAuthEntryMode('login')}
                  >
                    登录
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="tm-user-account-auth-btn tm-user-account-auth-btn--secondary"
                      disabled={account.saving}
                      onClick={() => void account.logoutAccount().catch(() => undefined)}
                    >
                      退出登录
                    </button>
                    <button
                      type="button"
                      className="tm-user-account-auth-btn tm-user-account-auth-btn--danger"
                      disabled={account.saving}
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      注销账户
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {account.hubOnline === false ? (
            <p className="tm-user-account-hint">社区 Hub 未启动时，部分社区功能不可用。</p>
          ) : null}
          {account.isLoggedIn && registered && authBuildProfile?.cnAuthEnabled ? (
            !hasPhoneBinding || !hasWechatBinding ? (
              <div className="tm-user-account-bind-panel">
                {!hasPhoneBinding ? (
                  <p className="tm-user-account-bind-hint">绑定手机号，便于账户找回与国内功能使用</p>
                ) : null}
                <div className="tm-user-account-bind-actions">
                  {!hasPhoneBinding ? (
                    <button
                      type="button"
                      className="tm-user-account-auth-btn tm-user-account-auth-btn--bind tm-user-account-auth-btn--wide"
                      disabled={account.saving}
                      onClick={() => setBindProvider('tencent_phone')}
                    >
                      绑定手机号
                    </button>
                  ) : null}
                  {!hasWechatBinding ? (
                    <button
                      type="button"
                      className="tm-user-account-auth-btn tm-user-account-auth-btn--bind"
                      disabled={account.saving}
                      onClick={() => setBindProvider('tencent_wechat')}
                    >
                      绑定微信
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null
          ) : null}
        </div>

        <section className="tm-user-account-section tm-user-account-section--profile">
          <div className="tm-user-account-section-head">
            <span className="tm-user-account-section-title">个人资料</span>
            <button
              type="button"
              className="tm-user-account-save-link"
              disabled={account.saving || !displayName.trim()}
              onClick={saveProfileChanges}
            >
              保存修改
            </button>
          </div>

          <div className="tm-user-account-field-row tm-user-account-field-row--name">
            <label className="tm-user-account-field-label" htmlFor="user-account-display-name">
              显示名称
            </label>
            <input
              id="user-account-display-name"
              className="tm-user-account-input tm-user-account-input--name"
              value={displayName}
              maxLength={10}
              disabled={account.saving}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>

          <div className="tm-user-account-field-row">
            <span className="tm-user-account-field-label">头像图片</span>
            <div className="tm-user-account-avatar-actions">
              <button
                type="button"
                className="tm-user-account-inline-btn"
                disabled={account.saving}
                onClick={() => void account.pickAvatar().catch(() => undefined)}
              >
                更换头像
              </button>
              {identity?.avatarUrl ? (
                <button
                  type="button"
                  className="tm-user-account-text-btn"
                  disabled={account.saving}
                  onClick={() => void account.clearAvatar().catch(() => undefined)}
                >
                  移除
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="tm-user-account-section tm-user-account-section--last">
          <span className="tm-user-account-section-title">当前连接设备</span>
          {devices.length > 0 ? (
            devices.map((device) => <UserAccountDevicePanel key={device.deviceId} device={device} />)
          ) : (
            <p className="tm-user-account-section-desc">正在加载设备信息…</p>
          )}
        </section>
      </div>

      {authEntryMode ? (
        <AuthEntryModal
          open
          mode={authEntryMode}
          onClose={() => setAuthEntryMode(null)}
          onSuccess={() => {
            void account.load().catch(() => undefined)
          }}
        />
      ) : null}

      {bindProvider ? (
        <AuthBindModal
          open
          provider={bindProvider}
          onClose={() => setBindProvider(null)}
          onSuccess={() => {
            void account.load().catch(() => undefined)
          }}
        />
      ) : null}

      {showDeleteConfirm ? (
        <ConfirmDialog
          title="注销账户"
          message="注销将删除远端账户并解除与本机的绑定，本地智能体与知识库数据会保留。此操作不可撤销，确定继续吗？"
          confirmLabel="确认注销"
          danger
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false)
            if (
              authSession &&
              requiresDeleteReauth(authSession.lastLoginAt ?? null, authSession.bindings)
            ) {
              setShowDeleteReauth(true)
              return
            }
            void account.deleteAccount().catch(() => undefined)
          }}
        />
      ) : null}

      {showDeleteReauth && authSession ? (
        <DeleteAccountReauthModal
          open
          session={authSession}
          onClose={() => setShowDeleteReauth(false)}
          onDelete={async (reauthToken) => {
            await account.deleteAccount({ reauthToken })
          }}
        />
      ) : null}
    </>,
    document.body,
  )
}

interface UserAccountMenuProps {
  className?: string
}

export function UserAccountMenu({ className }: UserAccountMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const account = useUserAccount()

  const identity = account.identity
  const avatarFallback = getAvatarFallbackLabel({
    avatarUrl: identity?.avatarUrl,
  })

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={['tm-nav-avatar', className].filter(Boolean).join(' ')}
        title="用户账户"
        aria-label="用户账户"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => {
            const next = !current
            if (!current) {
              void account.load().catch(() => undefined)
            }
            return next
          })
        }}
      >
        {identity?.avatarUrl ? (
          <img src={identity.avatarUrl} alt="" className="tm-nav-avatar-image" />
        ) : (
          avatarFallback
        )}
      </button>
      {open && buttonRef.current ? (
        <UserAccountPopover
          anchorEl={buttonRef.current}
          account={account}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
