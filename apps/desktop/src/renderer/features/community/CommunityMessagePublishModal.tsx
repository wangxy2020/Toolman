import { useEffect, useState } from 'react'

import { type CommunityBoardMessage } from '@toolman/shared'

import {
  createCommunityBoardMessage,
  patchCommunityBoardMessage,
} from './community-api.client'
import { notifyCommunityBoardChanged, notifyCommunityUserDataChanged } from './community-events'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  resumeMessage?: CommunityBoardMessage | null
  editOnly?: boolean
  onClose: () => void
  onCreated?: (message: string) => void
}

function parseBoardMessageBody(body: string): { title: string; content: string } {
  const parts = body.split('\n\n')
  if (parts.length >= 2) {
    return {
      title: parts[0]?.trim() ?? '',
      content: parts.slice(1).join('\n\n').trim(),
    }
  }

  const lines = body.split('\n')
  const firstLine = lines[0]?.trim() ?? ''
  const rest = lines.slice(1).join('\n').trim()
  if (firstLine && rest) {
    return { title: firstLine, content: rest }
  }

  return { title: '', content: body.trim() }
}

function buildMessageBody(title: string, body: string): string {
  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  if (!trimmedTitle) return trimmedBody
  if (!trimmedBody) return trimmedTitle
  return `${trimmedTitle}\n\n${trimmedBody}`
}

export function CommunityMessagePublishModal({
  resumeMessage = null,
  editOnly = false,
  onClose,
  onCreated,
}: Props) {
  const isResume = Boolean(resumeMessage)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!resumeMessage) return
    const parsed = parseBoardMessageBody(resumeMessage.body)
    setTitle(parsed.title)
    setBody(parsed.content || parsed.title)
    setError(null)
  }, [resumeMessage])

  const submitLabel = editOnly ? '保存修改' : isResume ? '重新提交' : '发布留言'

  const handleSubmit = async () => {
    const messageBody = buildMessageBody(title, body)
    if (!messageBody) {
      setError('请填写留言标题或内容')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (resumeMessage) {
        await patchCommunityBoardMessage(resumeMessage.id, messageBody)
        notifyCommunityUserDataChanged()
        notifyCommunityBoardChanged()
        onCreated?.(editOnly ? '修改已保存' : '留言已更新')
        onClose()
        return
      }

      await createCommunityBoardMessage({ body: messageBody })
      notifyCommunityUserDataChanged()
      notifyCommunityBoardChanged()
      onCreated?.('发布成功')
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '发布留言失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunityPublishModalShell
      title={
        editOnly ? '修改留言' : isResume ? '重新提交留言' : '发布留言'
      }
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '提交中…' : submitLabel}
          confirmDisabled={submitting || (!title.trim() && !body.trim())}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {editOnly ? (
        <CommunityPublishModalNotice message="修改留言内容后保存；确认无误后可使用「重新提交」再次发布。" />
      ) : null}

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
