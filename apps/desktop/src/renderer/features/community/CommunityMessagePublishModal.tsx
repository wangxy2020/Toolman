import { useEffect, useState } from 'react'

import { type CommunityBoardMessage } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import {
  createCommunityBoardMessage,
  patchCommunityBoardMessage,
} from './community-api.client'
import { notifyCommunityBoardChanged, notifyCommunityUserDataChanged } from './community-events'
import { invalidateCommunityListCache } from './community-list-cache'
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
  const { t } = useI18n()
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

  const submitLabel = editOnly
    ? t('communityPage.publish.saveChanges')
    : isResume
      ? t('communityPage.messagePublish.resubmit')
      : t('communityPage.messagePublish.publish')

  const modalTitle = editOnly
    ? t('communityPage.messagePublish.titleEdit')
    : isResume
      ? t('communityPage.messagePublish.titleResubmit')
      : t('communityPage.messagePublish.titlePublish')

  const handleSubmit = async () => {
    const messageBody = buildMessageBody(title, body)
    if (!messageBody) {
      setError(t('communityPage.messagePublish.fillRequired'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (resumeMessage) {
        await patchCommunityBoardMessage(resumeMessage.id, messageBody)
        invalidateCommunityListCache('board:')
        notifyCommunityUserDataChanged()
        notifyCommunityBoardChanged()
        onCreated?.(
          editOnly ? t('communityPage.messagePublish.successEdit') : t('communityPage.messagePublish.successUpdate'),
        )
        onClose()
        return
      }

      await createCommunityBoardMessage({ body: messageBody })
      invalidateCommunityListCache('board:')
      notifyCommunityUserDataChanged()
      notifyCommunityBoardChanged()
      onCreated?.(t('communityPage.messagePublish.successPublish'))
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t('communityPage.messagePublish.errorPublish'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunityPublishModalShell
      title={modalTitle}
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? t('communityPage.publish.submitting') : submitLabel}
          confirmDisabled={submitting || (!title.trim() && !body.trim())}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.messagePublish.editNotice')} />
      ) : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.messagePublish.titleLabel')}{' '}
          <span className="tm-community-publish-label-optional">{t('communityPage.publish.optional')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('communityPage.messagePublish.titlePlaceholder')}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.messagePublish.contentLabel')}{' '}
          <span className="tm-community-publish-required">{t('communityPage.publish.required')}</span>
        </span>
        <textarea
          className="tm-community-publish-textarea"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t('communityPage.messagePublish.contentPlaceholder')}
        />
      </label>
    </CommunityPublishModalShell>
  )
}
