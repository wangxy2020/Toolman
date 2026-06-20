import { useState } from 'react'

import { createCommunityBoardMessage } from './community-api.client'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  onClose: () => void
  onCreated?: () => void
}

export function CommunityMessagePublishModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <CommunityPublishModalShell
      title="发布留言"
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '发布中…' : '发布留言'}
          confirmDisabled={submitting || (!title.trim() && !body.trim())}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          留言标题 <span className="tm-community-publish-label-optional">(可选)</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="简短概括留言主题"
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          留言内容 <span className="tm-community-publish-required">*</span>
        </span>
        <textarea
          className="tm-community-publish-textarea"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="写下你想分享的留言、问题或建议…"
        />
      </label>
    </CommunityPublishModalShell>
  )
}
