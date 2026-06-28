import type { P2pPeerTrustRequiredPayload } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'

interface Props {
  prompt: P2pPeerTrustRequiredPayload
  error?: string | null
  onTrust: () => Promise<void>
  onReject: () => Promise<void>
}

function formatFingerprint(fingerprint: string): string {
  const normalized = fingerprint.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
  if (normalized.length <= 4) return normalized
  return normalized.match(/.{1,4}/g)?.join(' ') ?? normalized
}

export function GroupTrustDeviceModal({ prompt, error, onTrust, onReject }: Props) {
  const { t } = useI18n()

  return (
    <div className="tm-modal-overlay">
      <div className="tm-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="tm-confirm-dialog-title">{t('groupPage.trustDevice.title')}</h2>
        <p className="tm-confirm-dialog-message">
          {t('groupPage.trustDevice.messageIntro', {
            displayName: prompt.displayName,
            deviceName: prompt.deviceName,
          })}
        </p>
        <p className="tm-confirm-dialog-message">{t('groupPage.trustDevice.messageHint')}</p>

        {error && <div className="tm-error-bar">{error}</div>}

        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--tm-surface-elevated, rgba(0,0,0,0.04))',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 18,
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}
        >
          {formatFingerprint(prompt.publicKeyFingerprint)}
        </div>

        <p className="tm-kb-file-dropzone-hint" style={{ marginBottom: 16 }}>
          {t('groupPage.trustDevice.trustHint')}
        </p>

        <div className="tm-confirm-dialog-actions">
          <button
            type="button"
            className="tm-btn tm-btn--ghost"
            onClick={() => void onReject()}
          >
            {t('groupPage.trustDevice.reject')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void onTrust()}
          >
            {t('groupPage.trustDevice.trust')}
          </button>
        </div>
      </div>
    </div>
  )
}
