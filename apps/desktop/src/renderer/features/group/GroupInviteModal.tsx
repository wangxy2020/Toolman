import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { createStyledInviteQrDataUrl } from './invite-qr-code'
import { IpcChannel } from '@toolman/shared'

interface Props {
  workspaceId: string
  workspaceName: string
  onClose: () => void
}

export function GroupInviteModal({ workspaceId, workspaceName, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      setInviteUrl('')
      setInviteToken('')
      setQrDataUrl('')
      setExpiresAt(null)

      try {
        const result = await window.api.invoke(IpcChannel.P2pMemberInvite, {
          workspaceId,
          role: 'member',
          maxUses: 10,
          expiresInHours: 72,
        })

        if (cancelled) return

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        const data = result.data as {
          inviteToken: string
          inviteUrl: string
          qrData: string
          expiresAt: number
        }
        setInviteToken(data.inviteToken)
        setInviteUrl(data.inviteUrl)
        setExpiresAt(data.expiresAt)

        try {
          const url = await createStyledInviteQrDataUrl(data.qrData, {
            size: 220,
            centerLabel: '群',
          })
          if (!cancelled) setQrDataUrl(url)
        } catch {
          try {
            const url = await QRCode.toDataURL(data.qrData, { margin: 2, width: 200 })
            if (!cancelled) setQrDataUrl(url)
          } catch {
            if (!cancelled) setQrDataUrl('')
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : '生成邀请失败'
          setError(
            message.includes('No handler registered')
              ? '邀请服务未就绪，请完全退出并重新启动应用'
              : message.includes('secure storage') || message.includes('private key')
                ? '设备密钥读取失败，请完全退出并重新启动应用后重试'
                : message,
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('复制失败，请手动选择文本复制')
    }
  }

  const expiresLabel =
    expiresAt != null
      ? new Date(expiresAt).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

  const ready = !loading && !error && Boolean(inviteUrl)

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--narrow tm-modal--invite"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">邀请加入「{workspaceName}」</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error && <div className="tm-error-bar">{error}</div>}

          <div className="tm-invite-qr-wrap">
            <div className="tm-invite-qr-card">
              {qrDataUrl ? (
                <img className="tm-invite-qr-image" src={qrDataUrl} alt="邀请二维码" />
              ) : (
                <div className="tm-invite-qr-placeholder" aria-busy={loading}>
                  {loading ? '生成邀请中…' : '二维码生成失败'}
                </div>
              )}
            </div>
          </div>

          <p className="tm-kb-file-dropzone-hint tm-invite-hint">
            {loading
              ? '正在生成邀请链接与二维码…'
              : ready
                ? `扫描二维码或复制邀请链接，发送给其他成员。链接内已包含广域网连接信息（SDP），不同网络也可尝试加入。有效期至 ${expiresLabel}。`
                : '邀请生成失败，请关闭后重试。'}
          </p>

          <label className="tm-model-form-field tm-invite-url-field">
            <span className="tm-model-form-label">邀请链接</span>
            <input
              type="text"
              className="tm-model-form-input tm-invite-url-preview"
              value={inviteUrl}
              readOnly
              placeholder={loading ? '生成中…' : ''}
              disabled={!ready}
              title={inviteUrl || undefined}
            />
          </label>

          <div className="tm-invite-actions">
            <button
              type="button"
              className="tm-btn tm-btn--secondary"
              disabled={!ready}
              onClick={() => void handleCopy(inviteUrl)}
            >
              {copied ? '已复制' : '复制链接'}
            </button>
            <button
              type="button"
              className="tm-btn tm-btn--secondary"
              disabled={!ready}
              onClick={() => void handleCopy(inviteToken)}
            >
              复制邀请码
            </button>
          </div>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
