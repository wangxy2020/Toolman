import { useEffect, useState } from 'react'

import { type CommunityTaskItem, type CommunityTaskType } from '@toolman/shared'

import {
  createCommunityTask,
  getCommunityHubHealth,
  getCommunityTask,
  patchCommunityTask,
  publishCommunityTask,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildTaskPublishSuccessMessage } from './community-resource-status'
import { parseTaskTags, TASK_TYPE_LABELS } from './community-task-utils'
import { canModerationResubmitTask } from './community-user-center-status'
import { useI18n } from '../../i18n/useI18n'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  resumeTask?: CommunityTaskItem | null
  editOnly?: boolean
  onClose: () => void
  onCreated?: (message: string) => void
}

const TASK_TYPES = Object.keys(TASK_TYPE_LABELS) as CommunityTaskType[]

function toDatetimeLocalValue(timestamp: number | null | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export function TaskCreateModal({ resumeTask = null, editOnly = false, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const isResume = Boolean(resumeTask)
  const isDraftResume = resumeTask?.status === 'draft'
  const isRejected = resumeTask ? canModerationResubmitTask(resumeTask) : false
  const readOnlyFields = isDraftResume && !editOnly && !isRejected
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<CommunityTaskType>('development')
  const [budgetAmount, setBudgetAmount] = useState('0')
  const [budgetCurrency, setBudgetCurrency] = useState('CNY')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requireReview, setRequireReview] = useState(true)

  useEffect(() => {
    void getCommunityHubHealth()
      .then((health) => setRequireReview(health.requireReview ?? false))
      .catch(() => setRequireReview(true))
  }, [])

  useEffect(() => {
    if (!resumeTask) return
    setTitle(resumeTask.title)
    setDescription(resumeTask.description ?? '')
    setTaskType(resumeTask.taskType)
    setBudgetAmount(String(resumeTask.budgetAmount ?? 0))
    setBudgetCurrency(resumeTask.budgetCurrency || 'CNY')
    setDeadlineAt(toDatetimeLocalValue(resumeTask.deadlineAt))
    setTags(resumeTask.tags.join(', '))
    setError(null)
  }, [resumeTask])

  const submitLabel = editOnly
    ? t('communityPage.publish.saveChanges')
    : requireReview
      ? t('communityPage.publish.submitReview')
      : t('communityPage.taskPublish.publishTask')

  const buildPatchInput = (taskId: string) => ({
    id: taskId,
    title: title.trim(),
    description: description.trim(),
    taskType,
    budgetAmount: Number(budgetAmount) || 0,
    budgetCurrency: budgetCurrency.trim() || 'CNY',
    deadlineAt: deadlineAt ? new Date(deadlineAt).getTime() : null,
    tags: parseTaskTags(tags),
  })

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(t('communityPage.taskPublish.fillTitle'))
      return
    }

    setSubmitting(true)
    setError(null)
    let createdId: string | undefined = resumeTask?.id
    try {
      if (editOnly && resumeTask) {
        await patchCommunityTask(buildPatchInput(resumeTask.id))
        notifyCommunityUserDataChanged()
        onCreated?.(t('communityPage.taskPublish.successEdit'))
        onClose()
        return
      }

      const taskId =
        resumeTask?.id ??
        (await createCommunityTask({
          title: title.trim(),
          description: description.trim(),
          taskType,
          budgetAmount: Number(budgetAmount) || 0,
          budgetCurrency: budgetCurrency.trim() || 'CNY',
          deadlineAt: deadlineAt ? new Date(deadlineAt).getTime() : undefined,
          tags: parseTaskTags(tags),
        })).id
      createdId = taskId

      if (resumeTask && (isRejected || isDraftResume)) {
        await patchCommunityTask(buildPatchInput(taskId))
      }

      const published = await publishCommunityTask(taskId)
      notifyCommunityUserDataChanged()
      onCreated?.(buildTaskPublishSuccessMessage(published.status, requireReview, t))
      onClose()
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : t('communityPage.taskPublish.publishFailed')
      if (createdId) {
        try {
          const existing = await getCommunityTask(createdId)
          if (existing.status === 'pending_review' || existing.status === 'open') {
            notifyCommunityUserDataChanged()
            onCreated?.(buildTaskPublishSuccessMessage(existing.status, requireReview, t))
            onClose()
            return
          }
        } catch {
          // fall through to error display
        }
      }
      setError(
        createdId && !isResume
          ? t('communityPage.taskPublish.draftSavedHint', { message })
          : message,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const modalTitle = editOnly
    ? t('communityPage.taskPublish.titleEdit')
    : isRejected
      ? t('communityPage.taskPublish.titleResubmit')
      : isResume
        ? t('communityPage.taskPublish.titleContinue')
        : requireReview
          ? t('communityPage.taskPublish.titleSubmitReview')
          : t('communityPage.taskPublish.titlePublish')

  return (
    <CommunityPublishModalShell
      title={modalTitle}
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? t('communityPage.publish.submitting') : submitLabel}
          confirmDisabled={submitting}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {isDraftResume && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.taskPublish.draftNotice')} />
      ) : null}
      {isRejected && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.taskPublish.rejectedNotice')} />
      ) : null}
      {editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.taskPublish.editNotice')} />
      ) : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.taskPublish.titleLabel')}{' '}
          <span className="tm-community-publish-required">{t('communityPage.publish.required')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('communityPage.taskPublish.titlePlaceholder')}
          readOnly={readOnlyFields}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">{t('communityPage.taskPublish.descriptionLabel')}</span>
        <textarea
          className="tm-community-publish-textarea"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('communityPage.taskPublish.descriptionPlaceholder')}
          readOnly={readOnlyFields}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">{t('communityPage.taskPublish.typeLabel')}</span>
        <select
          className="tm-community-publish-input tm-community-publish-input--select"
          value={taskType}
          onChange={(event) => setTaskType(event.target.value as CommunityTaskType)}
          disabled={readOnlyFields}
        >
          {TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {TASK_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.taskPublish.budgetLabel')}</span>
          <input
            type="number"
            className="tm-community-publish-input"
            min="0"
            step="1"
            value={budgetAmount}
            onChange={(event) => setBudgetAmount(event.target.value)}
            readOnly={readOnlyFields}
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.taskPublish.currencyLabel')}</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--medium"
            value={budgetCurrency}
            onChange={(event) => setBudgetCurrency(event.target.value)}
            readOnly={readOnlyFields}
          />
        </label>
      </div>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.taskPublish.deadlineLabel')}{' '}
          <span className="tm-community-publish-label-optional">{t('communityPage.publish.optional')}</span>
        </span>
        <input
          type="datetime-local"
          className="tm-community-publish-input"
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
          readOnly={readOnlyFields}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">{t('communityPage.taskPublish.tagsLabel')}</span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder={t('communityPage.taskPublish.tagsPlaceholder')}
          readOnly={readOnlyFields}
        />
      </label>
    </CommunityPublishModalShell>
  )
}
