import { useState } from 'react'

interface Props {
  onClose: () => void
  onSubmit: (input: { name: string; description?: string }) => Promise<void>
}

export function GroupCreateModal({ onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请输入群组名称')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">创建群组</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error && <div className="tm-error-bar">{error}</div>}

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">群组名称</span>
            <input
              className="tm-model-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入群组名称"
              maxLength={100}
              autoFocus
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">描述（可选）</span>
            <textarea
              className="tm-model-form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述群组用途"
              maxLength={500}
              rows={3}
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
