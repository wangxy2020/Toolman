import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { IdentityDeviceSummary } from '@toolman/shared'
import { USER_ROLE_LABELS } from '../community/community-user-utils'
import { IconChevronRight } from '../../components/icons'
import { useUserAccount } from './useUserAccount'
import { getAvatarFallbackLabel, shortenId } from './user-avatar-utils'

interface UserAccountDeviceEntryProps {
  device: IdentityDeviceSummary
  showAddButton?: boolean
}

function UserAccountDeviceEntry({ device, showAddButton = false }: UserAccountDeviceEntryProps) {
  return (
    <div className="tm-user-account-device-entry">
      <div className="tm-user-account-profile-grid tm-user-account-device-row">
        <span className="tm-user-account-field-label">设备名称</span>
        {showAddButton ? (
          <button
            type="button"
            className="tm-btn tm-btn--secondary tm-user-account-profile-action"
            disabled
            title="移动端设备接入即将推出"
          >
            添加设备
          </button>
        ) : (
          <span className="tm-user-account-device-action-placeholder" aria-hidden="true" />
        )}
        <details className="tm-user-account-device-details">
          <summary className="tm-user-account-device-summary">
            <span className="tm-user-account-device-name">
              <IconChevronRight size={14} className="tm-user-account-device-chevron" />
              {device.deviceName}
            </span>
          </summary>
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
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [displayName, setDisplayName] = useState('')
  const identity = account.identity
  const community = account.communityProfile
  const devices = identity ? [identity.device] : []

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
  }, [anchorEl, account.loading, account.identity, account.communityProfile, devices.length])

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
      onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [anchorEl, onClose])

  const avatarFallback = getAvatarFallbackLabel({
    avatarUrl: identity?.avatarUrl,
  })

  return createPortal(
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
        <div className="tm-user-account-popover-profile">
          <div className="tm-user-account-avatar tm-user-account-avatar--large">
            {identity?.avatarUrl ? (
              <img src={identity.avatarUrl} alt="" className="tm-user-account-avatar-image" />
            ) : (
              avatarFallback
            )}
          </div>
          <div className="tm-user-account-popover-meta">
            <div className="tm-user-account-popover-name">
              {identity?.displayName ?? '本地用户'}
            </div>
            <div className="tm-user-account-popover-subtitle">
              {community
                ? `社区 · ${USER_ROLE_LABELS[community.role]}`
                : account.hubOnline === false
                  ? '社区未连接'
                  : '本地账户'}
            </div>
          </div>
        </div>
      </header>

      {account.error ? <div className="tm-user-account-popover-error">{account.error}</div> : null}

      <section className="tm-user-account-section">
        <h3 className="tm-user-account-section-title">社区账户</h3>
        {community ? (
          <>
            <p className="tm-user-account-section-desc">已使用本机身份登录社区，可发布与互动。</p>
            <div className="tm-user-account-community-actions">
              <button
                type="button"
                className="tm-btn tm-btn--secondary"
                disabled={account.saving}
                onClick={() => void account.loginCommunity().catch(() => undefined)}
              >
                刷新社区资料
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--ghost"
                disabled={account.saving}
                onClick={() => account.logoutCommunity()}
              >
                退出登录
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="tm-user-account-section-desc">
              使用本机身份注册或登录社区账户，无需额外密码。
            </p>
            <button
              type="button"
              className="tm-btn tm-btn--secondary tm-user-account-action-btn"
              disabled={account.saving || account.hubOnline === false}
              onClick={() => void account.loginCommunity().catch(() => undefined)}
            >
              登录 / 注册
            </button>
          </>
        )}
        {account.hubOnline === false ? (
          <p className="tm-user-account-hint">社区 Hub 未启动时无法登录。</p>
        ) : null}
      </section>

      <section className="tm-user-account-section">
        <h3 className="tm-user-account-section-title">个人资料</h3>
        <div className="tm-user-account-profile-grid">
          <span className="tm-user-account-field-label tm-user-account-profile-label">显示名称</span>
          <input
            className="tm-form-input tm-user-account-name-input"
            value={displayName}
            maxLength={10}
            disabled={account.saving}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button
            type="button"
            className="tm-btn tm-user-account-profile-action"
            disabled={account.saving || !displayName.trim()}
            onClick={() => void account.saveDisplayName(displayName).catch(() => undefined)}
          >
            保存名称
          </button>
          <span className="tm-user-account-field-label">头像</span>
          <div className="tm-user-account-profile-actions">
            <button
              type="button"
              className="tm-btn tm-btn--secondary tm-user-account-profile-action"
              disabled={account.saving}
              onClick={() => void account.pickAvatar().catch(() => undefined)}
            >
              更换头像
            </button>
            {identity?.avatarUrl ? (
              <button
                type="button"
                className="tm-btn tm-btn--ghost"
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
        <h3 className="tm-user-account-section-title">设备管理</h3>
        {devices.length > 0 ? (
          <div className="tm-user-account-devices">
            {devices.map((device, index) => (
              <UserAccountDeviceEntry
                key={device.deviceId}
                device={device}
                showAddButton={index === 0}
              />
            ))}
          </div>
        ) : (
          <p className="tm-user-account-section-desc">正在加载设备信息…</p>
        )}
      </section>
    </div>,
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
