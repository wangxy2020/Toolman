import { useEffect, useState } from 'react'

import { createCommunityBoardMessage } from './community-api.client'

interface Props {
  onClose: () => void
  onCreated?: () => void
}

export function CommunityMessagePublishModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const buildMessageBody = () => {
    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()
    if (!trimmedTitle) return trimmedBody
    if (!trimmedBody) return trimmedTitle
    return `${trimmedTitle}\n\n${trimmedBody}`
  }

  const handleSubmit = async () => {
    const messageBody = buildMessageBody()
    if (!messageBody) {
      setError('请填写留言标题或内容')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createCommunityBoardMessage({ body: messageBody })
      onCreated?.()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '发布留言失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--narrow tm-modal--form" onClick={(event) => event.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">发布留言</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}

          <label className="tm-form-field">
            <span className="tm-form-label">标题</span>
            <input
              className="tm-form-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="简短概括留言主题（可选）"
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">留言内容</span>
            <textarea
              className="tm-form-textarea"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="写下你想分享的留言、问题或建议…"
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={submitting || (!title.trim() && !body.trim())}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '发布中…' : '发布留言'}
          </button>
        </div>
      </div>
    </div>
  )
}
