import { useEffect, useState } from 'react'

import {
  pickPrimaryDeleteReauthMethod,
  type AuthSession,
  type DeleteReauthMethod,
} from '@toolman/shared'

import { sendAuthSmsCode, verifyDeleteAccountReauth } from './auth-api.client'

interface Props {
  open: boolean
  session: AuthSession
  onClose: () => void
  onDelete: (reauthToken: string) => Promise<void>
}

export function DeleteAccountReauthModal({ open, session, onClose, onDelete }: Props) {
  const method: DeleteReauthMethod | null = pickPrimaryDeleteReauthMethod(session.bindings)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [devHint, setDevHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const emailBinding = session.bindings.find((binding) => binding.provider === 'firebase_email')
    setEmail(emailBinding?.label?.includes('@') ? emailBinding.label : '')
    setPassword('')
    setPhone('')
    setSmsCode('')
    setError(null)
    setDevHint(null)
  }, [open, session.bindings])

  useEffect(() => {
    if (smsCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setSmsCooldown((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [smsCooldown])

  if (!open) return null

  const sendSms = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await sendAuthSmsCode({ phone: phone.trim(), region: 'cn', intent: 'login' })
      setSmsCooldown(result.retryAfterSeconds)
      setDevHint(result.devHint ?? null)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '验证码发送失败')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!method) {
      setError('当前账户不支持二次验证，请先退出并重新登录后再注销')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const { reauthToken } = await verifyDeleteAccountReauth(
        method === 'firebase_email'
          ? { method, email: email.trim(), password }
          : { method, phone: phone.trim(), code: smsCode.trim() },
      )
      await onDelete(reauthToken)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '身份验证失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--auth-entry" onClick={onClose}>
      <div
        className="tm-modal tm-auth-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-reauth-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 id="delete-reauth-title" className="tm-modal-title">
            验证身份以注销账户
          </h2>
          <p className="tm-auth-entry-subtitle">
            距离上次登录已超过 15 分钟，请再次验证身份后继续注销。
          </p>
        </header>

        {error ? <div className="tm-auth-entry-error">{error}</div> : null}
        {devHint ? <div className="tm-auth-entry-dev-hint">{devHint}</div> : null}

        <div className="tm-modal-body tm-auth-entry-body">
          {!method ? (
            <p className="tm-auth-entry-section-desc">
              当前账户仅支持 OAuth 登录，请先退出并重新登录后再尝试注销。
            </p>
          ) : method === 'firebase_email' ? (
            <div className="tm-auth-entry-form">
              <label className="tm-form-field">
                <span className="tm-form-label">邮箱</span>
                <input
                  className="tm-form-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="tm-form-field">
                <span className="tm-form-label">密码</span>
                <input
                  className="tm-form-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="tm-auth-entry-form">
              <label className="tm-form-field">
                <span className="tm-form-label">手机号</span>
                <input
                  className="tm-form-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+86"
                  value={phone}
                  disabled={busy}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              <label className="tm-form-field">
                <span className="tm-form-label">验证码</span>
                <div className="tm-auth-entry-code-row">
                  <input
                    className="tm-form-input"
                    type="text"
                    inputMode="numeric"
                    value={smsCode}
                    disabled={busy}
                    onChange={(event) => setSmsCode(event.target.value)}
                  />
                  <button
                    type="button"
                    className="tm-btn tm-btn--secondary"
                    disabled={busy || !phone.trim() || smsCooldown > 0}
                    onClick={() => void sendSms()}
                  >
                    {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
                  </button>
                </div>
              </label>
            </div>
          )}
        </div>

        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          {method ? (
            <button
              type="button"
              className="tm-btn tm-message-delete-confirm-submit"
              disabled={
                busy ||
                (method === 'firebase_email'
                  ? !email.trim() || !password.trim()
                  : !phone.trim() || !smsCode.trim())
              }
              onClick={() => void submit()}
            >
              验证并注销
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
