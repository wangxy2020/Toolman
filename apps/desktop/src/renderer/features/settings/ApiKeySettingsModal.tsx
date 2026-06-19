import { useState } from 'react'
import { SettingsToggle } from './SettingsShared'

interface Props {
  hasApiKey: boolean
  apiKeyRotate: boolean
  onClose: () => void
  onSave: (data: { apiKeys: string; apiKeyRotate: boolean }) => Promise<void>
}

function IconHelp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function ApiKeySettingsModal({ hasApiKey, apiKeyRotate, onClose, onSave }: Props) {
  const [keysText, setKeysText] = useState('')
  const [rotate, setRotate] = useState(apiKeyRotate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const apiKeys = keysText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .join(',')

      if (!apiKeys && !hasApiKey) {
        setError('请至少填写一个 API 密钥')
        setBusy(false)
        return
      }

      await onSave({ apiKeys, apiKeyRotate: rotate })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">API 密钥设置</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-form-body">
          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              API 密钥
              <span className="tm-model-form-help" title="可配置多个密钥，每行一个或使用逗号分隔">
                <IconHelp />
              </span>
            </span>
            <textarea
              className="tm-api-key-textarea"
              value={keysText}
              placeholder={
                hasApiKey
                  ? '已配置密钥（留空表示不修改）。每行一个，或使用逗号分隔。'
                  : '每行一个密钥，或使用逗号分隔'
              }
              rows={5}
              onChange={(e) => setKeysText(e.target.value)}
            />
            <p className="tm-model-form-hint">多个密钥使用逗号或换行分隔。保存后将加密存储在系统 Keychain。</p>
          </label>

          <div className="tm-model-form-row">
            <span className="tm-model-form-label">
              轮询使用多个密钥
              <span className="tm-model-form-help" title="请求失败或负载均衡时自动切换下一个密钥">
                <IconHelp />
              </span>
            </span>
            <SettingsToggle checked={rotate} onChange={setRotate} />
          </div>

          {error && <p className="tm-model-form-error">{error}</p>}
        </div>

        <footer className="tm-model-form-footer">
          <button type="button" className="tm-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
