import { useState } from 'react'
import type { ProviderModel } from '@toolman/shared'
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
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const rawId = modelId.trim()
    if (!rawId) {
      setError('请填写模型 ID')
      return
    }
    const id = presetId === 'deepseek' ? normalizeDeepSeekModelId(rawId) : rawId
    if (presetId === 'deepseek' && !isDeepSeekSupportedModelId(id)) {
      setError('DeepSeek 支持：deepseek-v4-flash、deepseek-v4-pro')
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
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-form-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">添加模型</h2>
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
            <input
              className="tm-model-form-input"
              value={modelId}
              placeholder={
                presetId === 'deepseek'
                  ? '例如 deepseek-v4-flash 或 deepseek-v4-pro'
                  : '必填 例如 gpt-3.5-turbo'
              }
              onChange={(e) => setModelId(e.target.value)}
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              模型名称
              <span className="tm-model-form-help" title="在界面中显示的名称">
                <IconHelp />
              </span>
            </span>
            <input
              className="tm-model-form-input"
              value={modelName}
              placeholder="例如 GPT-4"
              onChange={(e) => setModelName(e.target.value)}
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">
              分组名称
              <span className="tm-model-form-help" title="用于在列表中分组展示">
                <IconHelp />
              </span>
            </span>
            <input
              className="tm-model-form-input"
              value={groupName}
              placeholder="例如 ChatGPT"
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
            {busy ? '添加中…' : '添加模型'}
          </button>
        </footer>
      </div>
    </div>
  )
}
