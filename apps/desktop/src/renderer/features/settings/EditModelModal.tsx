import { useMemo, useState } from 'react'
import type { ProviderModel } from '@toolman/shared'
import { IconCopy } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { getModelTypeLabel } from '../../i18n/settings-labels'
import { SettingsToggle } from './SettingsShared'
import {
  getDefaultModelTypes,
  getModelTypeSupport,
  hasSavedModelTypes,
  inferModelGroup,
  normalizeModelTypes,
  type ModelTypeKey,
  type ModelTypeState,
} from '@toolman/shared'

interface Props {
  model: ProviderModel
  onClose: () => void
  onSave: (model: ProviderModel) => Promise<void>
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

import { MODEL_TYPE_OPTIONS } from './provider-model-utils'
import { ModelTypeIcon } from './ModelTypeIcon'

function buildInitialTypes(model: ProviderModel): ModelTypeState {
  if (hasSavedModelTypes(model.types)) {
    return normalizeModelTypes(model.id, model.types!)
  }
  return getDefaultModelTypes(model.id)
}

export function EditModelModal({ model, onClose, onSave }: Props) {
  const { t } = useI18n()
  const [modelId] = useState(model.id)
  const [name, setName] = useState(model.name)
  const [group, setGroup] = useState(model.group ?? inferModelGroup(model.id))
  const support = useMemo(() => getModelTypeSupport(model.id), [model.id])
  const [types, setTypes] = useState<ModelTypeState>(() => buildInitialTypes(model))
  const [showMore, setShowMore] = useState(true)
  const [incrementalOutput, setIncrementalOutput] = useState(model.incrementalOutput ?? !support.embedding)
  const [currency, setCurrency] = useState<'USD' | 'CNY'>(model.currency ?? 'USD')
  const [inputPrice, setInputPrice] = useState(String(model.inputPrice ?? 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const availableOptions = MODEL_TYPE_OPTIONS.filter((opt) => support[opt.key])
  const lockedTypes = support.embedding || support.rerank

  const toggleType = (key: ModelTypeKey) => {
    if (!support[key] || lockedTypes) return
    setTypes((prev) => normalizeModelTypes(modelId, { ...prev, [key]: !prev[key] }))
  }

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(modelId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(t('settings.models.edit.errors.copyFailed'))
    }
  }

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    const normalizedTypes = normalizeModelTypes(modelId, types)
    try {
      await onSave({
        id: modelId,
        name: name.trim() || modelId,
        group: group.trim() || inferModelGroup(modelId),
        types: normalizedTypes,
        incrementalOutput: support.embedding || support.rerank ? false : incrementalOutput,
        currency,
        inputPrice: Number(inputPrice) || 0,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.models.edit.errors.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal tm-model-form-modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{t('settings.models.edit.title')}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-form-body">
          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              <span className="tm-model-form-required">*</span> {t('settings.models.edit.idLabel')}
              <span className="tm-model-form-help" title={t('settings.models.edit.idHelp')}>
                <IconHelp />
              </span>
            </span>
            <div className="tm-model-form-input-wrap">
              <input className="tm-model-form-input" value={modelId} readOnly />
              <button
                type="button"
                className="tm-model-form-copy"
                title={t('common.copy')}
                onClick={() => void handleCopyId()}
              >
                <IconCopy size={16} />
              </button>
            </div>
            {copied && <span className="tm-model-form-copied">{t('common.copied')}</span>}
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              {t('settings.models.edit.nameLabel')}
              <span className="tm-model-form-help" title={t('settings.models.edit.nameHelp')}>
                <IconHelp />
              </span>
            </span>
            <input className="tm-model-form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              {t('settings.models.edit.groupLabel')}
              <span className="tm-model-form-help" title={t('settings.models.edit.groupHelp')}>
                <IconHelp />
              </span>
            </span>
            <input className="tm-model-form-input" value={group} onChange={(e) => setGroup(e.target.value)} />
          </label>

          <div className="tm-model-form-section">
            <div className="tm-model-form-section-head">
              <button
                type="button"
                className="tm-model-form-more-toggle"
                onClick={() => setShowMore((v) => !v)}
              >
                {t('settings.models.edit.moreSettings')} {showMore ? '∧' : '∨'}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--primary tm-model-form-save-inline"
                disabled={busy}
                onClick={() => void handleSave()}
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>

            {showMore && (
              <div className="tm-model-form-more">
                <div className="tm-model-form-field">
                  <span className="tm-model-form-label">{t('settings.models.edit.typeLabel')}</span>
                  {lockedTypes ? (
                    <p className="tm-model-form-hint">{t('settings.models.edit.typeLockedHint')}</p>
                  ) : null}
                  <div className="tm-model-type-grid">
                    {availableOptions.map((opt) => {
                      const active = types[opt.key]
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className={`tm-model-type-chip ${active ? 'tm-model-type-chip--active' : ''} tm-model-type-chip--${opt.key}`}
                          disabled={lockedTypes}
                          onClick={() => toggleType(opt.key)}
                        >
                          <ModelTypeIcon type={opt.key} size={14} />
                          <span>{getModelTypeLabel(opt.key, t)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {!support.embedding && !support.rerank && (
                  <>
                    <div className="tm-model-form-row">
                      <span className="tm-model-form-label">
                        {t('settings.models.edit.incrementalOutput')}
                        <span
                          className="tm-model-form-help"
                          title={t('settings.models.edit.incrementalOutputHelp')}
                        >
                          <IconHelp />
                        </span>
                      </span>
                      <SettingsToggle checked={incrementalOutput} onChange={setIncrementalOutput} />
                    </div>

                    <div className="tm-model-form-row">
                      <span className="tm-model-form-label">{t('settings.models.edit.currency')}</span>
                      <select
                        className="tm-model-form-select"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'CNY')}
                      >
                        <option value="USD">$</option>
                        <option value="CNY">¥</option>
                      </select>
                    </div>

                    <label className="tm-model-form-field">
                      <span className="tm-model-form-label">{t('settings.models.edit.inputPrice')}</span>
                      <div className="tm-model-form-price">
                        <input
                          className="tm-model-form-input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={inputPrice}
                          onChange={(e) => setInputPrice(e.target.value)}
                        />
                        <span className="tm-model-form-price-unit">
                          {t('settings.models.edit.pricePerMillionTokens', {
                            symbol: currency === 'CNY' ? '¥' : '$',
                          })}
                        </span>
                      </div>
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          {error && <p className="tm-model-form-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
