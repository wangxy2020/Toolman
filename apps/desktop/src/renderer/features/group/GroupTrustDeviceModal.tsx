import type { P2pPeerTrustRequiredPayload } from '@toolman/shared'

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
  return (
    <div className="tm-modal-overlay">
      <div className="tm-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="tm-confirm-dialog-title">确认新成员加入</h2>
        <p className="tm-confirm-dialog-message">
          成员 <strong>{prompt.displayName}</strong>（{prompt.deviceName}）请求加入群组。
          请核对下方设备指纹是否与对方显示一致，确认后才允许加入并同步数据。
        </p>

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
          仅信任你认识的设备。拒绝后将断开连接，且不会同步任何事件。
        </p>

        <div className="tm-confirm-dialog-actions">
          <button
            type="button"
            className="tm-btn tm-btn--ghost"
            onClick={() => void onReject()}
          >
            拒绝
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void onTrust()}
          >
            信任此设备
          </button>
        </div>
      </div>
    </div>
  )
}
