import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
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
  const { t } = useI18n()
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
        setError(t('settings.apiKey.errors.required'))
        setBusy(false)
        return
      }

      await onSave({ apiKeys, apiKeyRotate: rotate })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.apiKey.errors.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{t('settings.apiKey.title')}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-form-body">
          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              {t('settings.apiKey.label')}
              <span className="tm-model-form-help" title={t('settings.apiKey.help')}>
                <IconHelp />
              </span>
            </span>
            <textarea
              className="tm-api-key-textarea"
              value={keysText}
              placeholder={
                hasApiKey
                  ? t('settings.apiKey.placeholderConfigured')
                  : t('settings.apiKey.placeholder')
              }
              rows={5}
              onChange={(e) => setKeysText(e.target.value)}
            />
            <p className="tm-model-form-hint">{t('settings.apiKey.storageHint')}</p>
          </label>

          <div className="tm-model-form-row">
            <span className="tm-model-form-label">
              {t('settings.apiKey.rotateLabel')}
              <span className="tm-model-form-help" title={t('settings.apiKey.rotateHelp')}>
                <IconHelp />
              </span>
            </span>
            <SettingsToggle checked={rotate} onChange={setRotate} />
          </div>

          {error && <p className="tm-model-form-error">{error}</p>}
        </div>

        <footer className="tm-model-form-footer">
          <button type="button" className="tm-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
