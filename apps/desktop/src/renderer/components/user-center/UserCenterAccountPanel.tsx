import { useEffect, useState, type ReactNode } from 'react'

import { requiresDeleteReauth } from '@toolman/shared'

import { ConfirmDialog } from '../ConfirmDialog'
import { bindAuthProvider, changeAuthPassword, sendAuthSmsCode } from '../../features/user/auth-api.client'
import { DeleteAccountReauthModal } from '../../features/user/DeleteAccountReauthModal'
import type { useUserAccount } from '../../features/user/useUserAccount'
import { useAuthBuildProfile } from '../../features/user/useAuthBuildProfile'
import { isRegisteredUser } from '../../features/user/user-account-utils'
import type { ProfileSubView } from './types'

interface UserCenterAccountPanelProps {
  account: ReturnType<typeof useUserAccount>
  subView: ProfileSubView
  onSubViewChange: (view: ProfileSubView) => void
  onSwitchToLogin: () => void
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  )
}

function WechatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M7 10h.01M11 10h.01M15 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4-.8L3 20l1.2-3.6C3.41 15.03 3 13.55 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface AccountActionItem {
  key: string
  icon: ReactNode
  label: string
  secondary?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function AccountActionBox({
  icon,
  label,
  secondary,
  danger,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  secondary?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`tm-user-center-account-action-box${danger ? ' tm-user-center-account-action-box--danger' : ''}${secondary ? ' tm-user-center-account-action-box--multiline' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="tm-user-center-account-action-icon">{icon}</span>
      <span className="tm-user-center-account-action-label">
        <span className="tm-user-center-account-action-primary">{label}</span>
        {secondary ? (
          <span className="tm-user-center-account-action-secondary">{secondary}</span>
        ) : null}
      </span>
      <span className="tm-user-center-account-action-chevron">
        <ChevronRightIcon />
      </span>
    </button>
  )
}

function AccountPasswordInput({
  value,
  placeholder,
  disabled,
  autoComplete,
  onChange,
}: {
  value: string
  placeholder: string
  disabled?: boolean
  autoComplete?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="tm-auth-entry-input-shell">
      <input
        className="tm-auth-entry-input"
        type="password"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function AccountField({
  label,
  type = 'text',
  value,
  disabled,
  autoComplete,
  inputMode,
  onChange,
}: {
  label: string
  type?: string
  value: string
  disabled?: boolean
  autoComplete?: string
  inputMode?: 'tel' | 'numeric' | 'email'
  onChange: (value: string) => void
}) {
  return (
    <label className="tm-user-center-field">
      <span className="tm-user-center-field-label">{label}</span>
      <div className="tm-user-center-field-input-wrap">
        <input
          className="tm-user-center-field-input"
          type={type}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  )
}

export function UserCenterAccountPanel({
  account,
  subView,
  onSubViewChange,
  onSwitchToLogin,
}: UserCenterAccountPanelProps) {
  const { profile: authBuildProfile } = useAuthBuildProfile()
  const authSession = account.authSession
  const registered = isRegisteredUser(authSession)
  const hasPhoneBinding = authSession?.bindings.some((b) => b.provider === 'tencent_phone')
  const hasWechatBinding = authSession?.bindings.some((b) => b.provider === 'tencent_wechat')
  const hasEmailPasswordBinding = authSession?.bindings.some((b) => b.provider === 'firebase_email')
  const passwordChangeRegion = authSession?.authRegion === 'intl' ? 'intl' : 'cn'
  const canChangePassword =
    (authBuildProfile?.cnAuthEnabled && authSession?.authRegion === 'cn') ||
    (hasEmailPasswordBinding && authSession?.authRegion === 'intl')

  const [bindPhone, setBindPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [bindCooldown, setBindCooldown] = useState(0)
  const [bindBusy, setBindBusy] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteReauth, setShowDeleteReauth] = useState(false)

  useEffect(() => {
    if (bindCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setBindCooldown((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [bindCooldown])

  const sendBindCode = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      const result = await sendAuthSmsCode({ phone: bindPhone.trim(), region: 'cn', intent: 'login' })
      setBindCooldown(result.retryAfterSeconds)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : '验证码发送失败')
    } finally {
      setBindBusy(false)
    }
  }

  const submitBindPhone = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      await bindAuthProvider({
        provider: 'tencent_phone',
        payload: { phone: bindPhone.trim(), code: bindCode.trim() },
      })
      onSubViewChange('main')
      void account.load().catch(() => undefined)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : '绑定失败')
    } finally {
      setBindBusy(false)
    }
  }

  const submitBindWechat = async () => {
    setBindBusy(true)
    setBindError(null)
    try {
      await bindAuthProvider({ provider: 'tencent_wechat' })
      onSubViewChange('main')
      void account.load().catch(() => undefined)
    } catch (err) {
      setBindError(err instanceof Error ? err.message : '绑定失败')
    } finally {
      setBindBusy(false)
    }
  }

  const submitChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致')
      return
    }

    setPasswordBusy(true)
    setPasswordError(null)
    try {
      await changeAuthPassword({
        region: passwordChangeRegion,
        oldPassword,
        newPassword,
        confirmPassword,
      })
      setPasswordSuccess(true)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setPasswordBusy(false)
    }
  }

  const deleteDialogs = (
    <>
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
    </>
  )


  if (subView === 'bind_phone') {
    return (
      <>
        <div className="tm-user-center-account-panel">
          {bindError ? (
            <div className="tm-user-center-alert tm-user-center-alert--error" role="alert">
              {bindError}
            </div>
          ) : null}
          <div className="tm-user-center-account-form">
            <AccountField
              label="手机号"
              type="tel"
              inputMode="tel"
              value={bindPhone}
              disabled={bindBusy}
              onChange={setBindPhone}
            />
            <div className="tm-auth-entry-code-row">
              <div className="tm-auth-entry-input-shell tm-auth-entry-input-shell--grow">
                <input
                  className="tm-auth-entry-input tm-auth-entry-input--plain"
                  type="text"
                  inputMode="numeric"
                  placeholder="验证码"
                  value={bindCode}
                  disabled={bindBusy}
                  onChange={(e) => setBindCode(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="tm-auth-entry-sms-btn"
                disabled={bindBusy || !bindPhone.trim() || bindCooldown > 0}
                onClick={() => void sendBindCode()}
              >
                {bindCooldown > 0 ? `${bindCooldown}s` : '获取验证码'}
              </button>
            </div>
            <button
              type="button"
              className="tm-auth-entry-submit-btn"
              disabled={bindBusy || !bindPhone.trim() || !bindCode.trim()}
              onClick={() => void submitBindPhone()}
            >
              确认绑定
            </button>
            <button
              type="button"
              className="tm-user-center-text-link"
              disabled={bindBusy}
              onClick={() => onSubViewChange('main')}
            >
              返回
            </button>
          </div>
        </div>
        {deleteDialogs}
      </>
    )
  }

  if (subView === 'bind_wechat') {
    return (
      <>
        <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
          {bindError ? (
            <div className="tm-user-center-account-alert tm-user-center-account-alert--error" role="alert">
              {bindError}
            </div>
          ) : null}
          <div className="tm-user-center-account-form tm-user-center-account-form--auth">
            <p className="tm-user-center-account-form-desc">
              授权后可在微信与手机号之间共用同一 Toolman 账户。
            </p>
            <button
              type="button"
              className="tm-auth-entry-submit-btn"
              disabled={bindBusy}
              onClick={() => void submitBindWechat()}
            >
              打开微信授权
            </button>
            <button
              type="button"
              className="tm-user-center-text-link"
              disabled={bindBusy}
              onClick={() => onSubViewChange('main')}
            >
              返回
            </button>
          </div>
        </div>
        {deleteDialogs}
      </>
    )
  }

  if (subView === 'change_password') {
    return (
      <>
        <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
          {passwordError ? (
            <div className="tm-user-center-account-alert tm-user-center-account-alert--error" role="alert">
              {passwordError}
            </div>
          ) : null}
          {passwordSuccess ? (
            <div className="tm-user-center-account-alert tm-user-center-account-alert--success">
              密码已更新，请使用新密码登录。
            </div>
          ) : null}
          <div className="tm-user-center-account-form tm-user-center-account-form--auth">
            <AccountPasswordInput
              autoComplete="current-password"
              placeholder="请输入原密码"
              value={oldPassword}
              disabled={passwordBusy || passwordSuccess}
              onChange={setOldPassword}
            />
            <AccountPasswordInput
              autoComplete="new-password"
              placeholder="请输入新密码"
              value={newPassword}
              disabled={passwordBusy || passwordSuccess}
              onChange={setNewPassword}
            />
            <AccountPasswordInput
              autoComplete="new-password"
              placeholder="请再次输入新密码"
              value={confirmPassword}
              disabled={passwordBusy || passwordSuccess}
              onChange={setConfirmPassword}
            />
            <button
              type="button"
              className="tm-auth-entry-submit-btn"
              disabled={
                passwordBusy ||
                passwordSuccess ||
                !oldPassword.trim() ||
                !newPassword.trim() ||
                !confirmPassword.trim()
              }
              onClick={() => void submitChangePassword()}
            >
              确认修改
            </button>
            <button
              type="button"
              className="tm-user-center-text-link"
              disabled={passwordBusy}
              onClick={() => onSubViewChange('main')}
            >
              返回
            </button>
          </div>
        </div>
        {deleteDialogs}
      </>
    )
  }

  if (!registered) {
    return (
      <div className="tm-user-center-account-alert">
        注册并登录后可使用群组、社区互动与资源安装。
      </div>
    )
  }

  if (!account.isLoggedIn) {
    return (
      <div className="tm-user-center-account-panel">
        <div className="tm-user-center-alert tm-user-center-alert--warning">
          账户已注册，请重新登录以使用社区功能。
        </div>
        <button
          type="button"
          className="tm-auth-entry-submit-btn"
          disabled={account.saving}
          onClick={onSwitchToLogin}
        >
          去登录
        </button>
      </div>
    )
  }

  const securityItems: AccountActionItem[] = []

  if (!hasPhoneBinding) {
    securityItems.push({
      key: 'phone',
      icon: <PhoneIcon />,
      label: '绑定手机号',
      secondary: '账户找回与国内功能',
      onClick: () => onSubViewChange('bind_phone'),
    })
  }
  if (!hasWechatBinding) {
    securityItems.push({
      key: 'wechat',
      icon: <WechatIcon />,
      label: '绑定微信',
      disabled: true,
      onClick: () => onSubViewChange('bind_wechat'),
    })
  }
  if (canChangePassword) {
    securityItems.push({
      key: 'password',
      icon: <LockIcon />,
      label: '修改密码',
      onClick: () => onSubViewChange('change_password'),
    })
  }

  const accountActionItems: AccountActionItem[] = [
    {
      key: 'logout',
      icon: <LogoutIcon />,
      label: '退出登录',
      onClick: () => void account.logoutAccount().catch(() => undefined),
    },
    {
      key: 'delete',
      icon: <DeleteIcon />,
      label: '注销账户',
      danger: true,
      onClick: () => setShowDeleteConfirm(true),
    },
  ]

  return (
    <>
      <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
        {hasPhoneBinding && hasWechatBinding ? (
          <div className="tm-user-center-account-alert tm-user-center-account-alert--success">
            账户已就绪，安全绑定已完成。
          </div>
        ) : null}

        {securityItems.length > 0 ? (
          <div className="tm-user-center-account-section">
            <span className="tm-user-center-account-section-label">安全绑定</span>
            <div className="tm-user-center-account-stack">
              {securityItems.map((item) => (
                <AccountActionBox
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  secondary={item.secondary}
                  danger={item.danger}
                  disabled={account.saving || item.disabled}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="tm-user-center-account-empty">安全项已全部完成</p>
        )}

        <div className="tm-user-center-account-section tm-user-center-account-section--footer">
          <span className="tm-user-center-account-section-label">账户操作</span>
          <div className="tm-user-center-account-stack">
            {accountActionItems.map((item) => (
              <AccountActionBox
                key={item.key}
                icon={item.icon}
                label={item.label}
                secondary={item.secondary}
                danger={item.danger}
                disabled={account.saving || item.disabled}
                onClick={item.onClick}
              />
            ))}
          </div>
        </div>
      </div>
      {deleteDialogs}
    </>
  )
}

function accountPanelTitle(subView: ProfileSubView): string {
  switch (subView) {
    case 'bind_phone':
      return '绑定手机号'
    case 'bind_wechat':
      return '绑定微信'
    case 'change_password':
      return '修改密码'
    default:
      return '账户与安全'
  }
}

export function accountPanelSubtitle(subView: ProfileSubView): string {
  switch (subView) {
    case 'bind_phone':
    case 'bind_wechat':
    case 'change_password':
      return '完成操作后点击返回。'
    default:
      return '管理绑定、密码与账户操作。'
  }
}

export { accountPanelTitle }
