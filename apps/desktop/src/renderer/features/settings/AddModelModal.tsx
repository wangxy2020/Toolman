import { useState } from 'react'
import type { ProviderModel } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import type { ProviderPresetId } from './provider-presets'
import { createProviderModel, isDeepSeekSupportedModelId, normalizeDeepSeekModelId } from './provider-model-utils'

interface Props {
  presetId?: ProviderPresetId
  onClose: () => void
  onAdd: (model: ProviderModel) => Promise<void>
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

export function AddModelModal({ presetId, onClose, onAdd }: Props) {
  const { t } = useI18n()
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const rawId = modelId.trim()
    if (!rawId) {
      setError(t('settings.models.add.errors.idRequired'))
      return
    }
    const id = presetId === 'deepseek' ? normalizeDeepSeekModelId(rawId) : rawId
    if (presetId === 'deepseek' && !isDeepSeekSupportedModelId(id)) {
      setError(t('settings.models.add.errors.deepseekUnsupported'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onAdd(
        createProviderModel(id, {
          name: modelName.trim() || id,
          group: groupName.trim() || undefined,
        }),
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.models.add.errors.addFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{t('settings.models.add.title')}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-form-body">
          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              <span className="tm-model-form-required">*</span> {t('settings.models.add.idLabel')}
              <span className="tm-model-form-help" title={t('settings.models.add.idHelp')}>
                <IconHelp />
              </span>
            </span>
            <input
              className="tm-model-form-input"
              value={modelId}
              placeholder={
                presetId === 'deepseek'
                  ? t('settings.models.add.idPlaceholderDeepseek')
                  : t('settings.models.add.idPlaceholder')
              }
              onChange={(e) => setModelId(e.target.value)}
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              {t('settings.models.add.nameLabel')}
              <span className="tm-model-form-help" title={t('settings.models.add.nameHelp')}>
                <IconHelp />
              </span>
            </span>
            <input
              className="tm-model-form-input"
              value={modelName}
              placeholder={t('settings.models.add.namePlaceholder')}
              onChange={(e) => setModelName(e.target.value)}
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              {t('settings.models.add.groupLabel')}
              <span className="tm-model-form-help" title={t('settings.models.add.groupHelp')}>
                <IconHelp />
              </span>
            </span>
            <input
              className="tm-model-form-input"
              value={groupName}
              placeholder={t('settings.models.add.groupPlaceholder')}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </label>

          {error && <p className="tm-model-form-error">{error}</p>}
        </div>

        <footer className="tm-model-form-footer">
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? t('settings.models.add.submitting') : t('settings.models.add.submit')}
          </button>
        </footer>
      </div>
    </div>
  )
}
