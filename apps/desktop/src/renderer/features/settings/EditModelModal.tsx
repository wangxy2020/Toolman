import { useMemo, useState } from 'react'
import type { ProviderModel } from '@toolman/shared'
import { IconCopy } from '../../components/icons'
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
      setError('复制失败')
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
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal tm-model-form-modal--wide" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">编辑模型</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-form-body">
          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              <span className="tm-model-form-required">*</span> 模型 ID
              <span className="tm-model-form-help" title="模型在 API 中使用的唯一标识">
                <IconHelp />
              </span>
            </span>
            <div className="tm-model-form-input-wrap">
              <input className="tm-model-form-input" value={modelId} readOnly />
              <button type="button" className="tm-model-form-copy" title="复制" onClick={() => void handleCopyId()}>
                <IconCopy size={16} />
              </button>
            </div>
            {copied && <span className="tm-model-form-copied">已复制</span>}
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              模型名称
              <span className="tm-model-form-help" title="在界面中显示的名称">
                <IconHelp />
              </span>
            </span>
            <input className="tm-model-form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              分组名称
              <span className="tm-model-form-help" title="用于在列表中分组展示">
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
                更多设置 {showMore ? '∧' : '∨'}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--primary tm-model-form-save-inline"
                disabled={busy}
                onClick={() => void handleSave()}
              >
                {busy ? '保存中…' : '保存'}
              </button>
            </div>

            {showMore && (
              <div className="tm-model-form-more">
                <div className="tm-model-form-field">
                  <span className="tm-model-form-label">模型类型</span>
                  {lockedTypes ? (
                    <p className="tm-model-form-hint">该模型仅支持固定类型，不可修改其他能力。</p>
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
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {!support.embedding && !support.rerank && (
                  <>
                    <div className="tm-model-form-row">
                      <span className="tm-model-form-label">
                        支持增量文本输出
                        <span className="tm-model-form-help" title="流式返回模型输出">
                          <IconHelp />
                        </span>
                      </span>
                      <SettingsToggle checked={incrementalOutput} onChange={setIncrementalOutput} />
                    </div>

                    <div className="tm-model-form-row">
                      <span className="tm-model-form-label">币种</span>
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
                      <span className="tm-model-form-label">输入价格</span>
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
                          {currency === 'CNY' ? '¥' : '$'}/百万 Token
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
