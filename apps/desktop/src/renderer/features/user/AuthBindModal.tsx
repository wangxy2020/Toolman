import { useEffect, useState } from 'react'

import { bindAuthProvider, sendAuthSmsCode } from './auth-api.client'

interface Props {
  open: boolean
  provider: 'tencent_phone' | 'tencent_wechat'
  onClose: () => void
  onSuccess?: () => void
}

function AuthBindWechatIcon() {
  return (
    <svg className="tm-auth-entry-wechat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.17 1.161 4.095 2.972 5.43L2.048 19.2l3.72-1.237c.987.275 2.035.423 3.123.423.3 0 .595-.014.885-.041a6.64 6.64 0 0 1-.254-1.844c0-3.66 3.542-6.627 7.912-6.627.396 0 .784.028 1.162.082C16.735 4.787 12.853 2.188 8.691 2.188zm-2.93 4.066c.578 0 1.046.468 1.046 1.045a1.044 1.044 0 0 1-1.046 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.468-1.045 1.045-1.045zm5.859 0c.578 0 1.045.468 1.045 1.045a1.044 1.044 0 0 1-1.045 1.044 1.044 1.044 0 0 1-1.045-1.044c0-.577.467-1.045 1.045-1.045zM15.691 10.5c-4.136 0-7.487 2.873-7.487 6.417 0 2.078 1.101 3.937 2.83 5.17l-.735 2.204 2.415-.803c.822.228 1.69.352 2.592.352 4.136 0 7.487-2.873 7.487-6.417S19.827 10.5 15.691 10.5zm-2.992 3.416a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744zm5.984 0a.872.872 0 1 1 0 1.744.872.872 0 0 1 0-1.744z"
      />
    </svg>
  )
}

export function AuthBindModal({ open, provider, onClose, onSuccess }: Props) {
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [devHint, setDevHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (smsCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setSmsCooldown((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [smsCooldown])

  if (!open) return null

  const title = provider === 'tencent_wechat' ? '绑定微信' : '绑定手机号'
  const subtitle =
    provider === 'tencent_wechat'
      ? '授权后可在微信与手机号之间共用同一 Toolman 账户。'
      : '绑定后可在微信与手机号之间共用同一 Toolman 账户。'

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
    setBusy(true)
    setError(null)
    try {
      if (provider === 'tencent_wechat') {
        await bindAuthProvider({ provider: 'tencent_wechat' })
      } else {
        await bindAuthProvider({
          provider: 'tencent_phone',
          payload: { phone: phone.trim(), code: smsCode.trim() },
        })
      }
      onSuccess?.()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '绑定失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--auth-entry" onClick={onClose}>
      <div
        className="tm-auth-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-bind-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tm-auth-entry-hero">
          <h2 id="auth-bind-title" className="tm-auth-entry-title">
            {title}
          </h2>
          <p className="tm-auth-entry-subtitle">{subtitle}</p>
        </div>

        {error ? <div className="tm-auth-entry-error">{error}</div> : null}
        {devHint ? <div className="tm-auth-entry-dev-hint">{devHint}</div> : null}

        <div className="tm-auth-entry-body">
          {provider === 'tencent_phone' ? (
            <div className="tm-auth-entry-form">
              <div className="tm-auth-entry-phone-field">
                <span className="tm-auth-entry-phone-prefix">+86</span>
                <input
                  className="tm-auth-entry-input tm-auth-entry-input--plain"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  disabled={busy}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="tm-auth-entry-code-row">
                <div className="tm-auth-entry-input-shell tm-auth-entry-input-shell--grow">
                  <input
                    className="tm-auth-entry-input tm-auth-entry-input--plain"
                    type="text"
                    inputMode="numeric"
                    placeholder="请输入验证码"
                    value={smsCode}
                    disabled={busy}
                    onChange={(event) => setSmsCode(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="tm-auth-entry-sms-btn"
                  disabled={busy || !phone.trim() || smsCooldown > 0}
                  onClick={() => void sendSms()}
                >
                  {smsCooldown > 0 ? `${smsCooldown}s` : '获取验证码'}
                </button>
              </div>
              <button
                type="button"
                className="tm-auth-entry-submit-btn"
                disabled={busy || !phone.trim() || !smsCode.trim()}
                onClick={() => void submit()}
              >
                确认绑定
              </button>
              <button
                type="button"
                className="tm-auth-entry-cancel-btn"
                disabled={busy}
                onClick={onClose}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="tm-auth-entry-form">
              <button
                type="button"
                className="tm-auth-entry-provider-btn tm-auth-entry-provider-btn--wechat"
                disabled={busy}
                onClick={() => void submit()}
              >
                <AuthBindWechatIcon />
                打开微信授权
              </button>
              <button
                type="button"
                className="tm-auth-entry-cancel-btn"
                disabled={busy}
                onClick={onClose}
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
