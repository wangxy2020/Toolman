import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { createStyledInviteQrDataUrl } from './invite-qr-code'
import { IpcChannel } from '@toolman/shared'

import { getDateLocale } from '../../i18n/date-locale'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceId: string
  workspaceName: string
  onClose: () => void
}

const INVITE_QR_DISPLAY_SIZE = 176

export function GroupInviteModal({ workspaceId, workspaceName, onClose }: Props) {
  const { t, language } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [copied, setCopied] = useState<'url' | 'token' | null>(null)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

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
            size: INVITE_QR_DISPLAY_SIZE,
            renderScale: 3,
            marginModules: 4,
            moduleScale: 0.74,
            darkColor: '#00a962',
            centerLabel: t('groupPage.invite.qrCenterLabel'),
          })
          if (!cancelled) setQrDataUrl(url)
        } catch {
          try {
            const url = await QRCode.toDataURL(data.qrData, {
              margin: 3,
              width: INVITE_QR_DISPLAY_SIZE * 3,
              color: { dark: '#00a962', light: '#ffffff' },
            })
            if (!cancelled) setQrDataUrl(url)
          } catch {
            if (!cancelled) setQrDataUrl('')
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : t('groupPage.invite.generateFailed')
          setError(
            message.includes('No handler registered')
              ? t('groupPage.invite.serviceNotReady')
              : message.includes('secure storage') || message.includes('private key')
                ? t('groupPage.invite.keyReadFailed')
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
  }, [t, workspaceId])

  const handleCopy = async (text: string, kind: 'url' | 'token') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setError(t('groupPage.invite.copyFailed'))
    }
  }

  const expiresLabel =
    expiresAt != null
      ? new Date(expiresAt).toLocaleString(getDateLocale(language), {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

  const ready = !loading && !error && Boolean(inviteUrl)

  return createPortal(
    <div
      className="tm-modal-overlay tm-modal-overlay--invite"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="tm-modal tm-modal--invite"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-invite-title"
      >
        <div className="tm-modal-header">
          <h2 id="group-invite-title" className="tm-modal-title">
            {t('groupPage.invite.title', { name: workspaceName })}
          </h2>
          <button
            type="button"
            className="tm-modal-close"
            onClick={handleClose}
            aria-label={t('groupPage.invite.close')}
          >
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}

          <div className="tm-invite-qr-wrap">
            <div className="tm-invite-qr-card">
              {qrDataUrl ? (
                <img className="tm-invite-qr-image" src={qrDataUrl} alt={t('groupPage.invite.qrAlt')} />
              ) : (
                <div className="tm-invite-qr-placeholder" aria-busy={loading}>
                  {loading ? t('groupPage.invite.generatingQr') : t('groupPage.invite.qrFailed')}
                </div>
              )}
            </div>
          </div>

          <p className="tm-invite-hint">
            {loading
              ? t('groupPage.invite.generatingHint')
              : ready
                ? t('groupPage.invite.readyHint', { expires: expiresLabel })
                : t('groupPage.invite.failedHint')}
          </p>

          <label className="tm-invite-url-field">
            <span className="tm-invite-url-label">{t('groupPage.invite.linkLabel')}</span>
            <input
              type="text"
              className="tm-invite-url-preview"
              value={inviteUrl}
              readOnly
              placeholder={loading ? t('groupPage.invite.generating') : ''}
              disabled={!ready}
              title={inviteUrl || undefined}
            />
          </label>

          <div className="tm-invite-actions">
            <button
              type="button"
              className="tm-invite-action-btn"
              disabled={!ready}
              onClick={() => void handleCopy(inviteUrl, 'url')}
            >
              {copied === 'url' ? t('groupPage.invite.copied') : t('groupPage.invite.copyLink')}
            </button>
            <button
              type="button"
              className="tm-invite-action-btn"
              disabled={!ready}
              onClick={() => void handleCopy(inviteToken, 'token')}
            >
              {copied === 'token' ? t('groupPage.invite.copied') : t('groupPage.invite.copyToken')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
