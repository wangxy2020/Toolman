import { useEffect, useState } from 'react'

import { type CommunityTaskType } from '@toolman/shared'

import {
  createCommunityTask,
  getCommunityHubHealth,
  publishCommunityTask,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildTaskPublishSuccessMessage } from './community-resource-status'
import { parseTaskTags, TASK_TYPE_LABELS } from './community-task-utils'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

interface Props {
  onClose: () => void
  onCreated?: () => void
}

const TASK_TYPES = Object.keys(TASK_TYPE_LABELS) as CommunityTaskType[]

export function TaskCreateModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<CommunityTaskType>('development')
  const [budgetAmount, setBudgetAmount] = useState('0')
  const [budgetCurrency, setBudgetCurrency] = useState('CNY')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [requireReview, setRequireReview] = useState(true)

  useEffect(() => {
    void getCommunityHubHealth()
      .then((health) => setRequireReview(health.requireReview ?? false))
      .catch(() => setRequireReview(true))
  }, [])

  const submitLabel = requireReview ? '提交审核' : '发布任务'

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写任务标题')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const created = await createCommunityTask({
        title: title.trim(),
        description: description.trim(),
        taskType,
        budgetAmount: Number(budgetAmount) || 0,
        budgetCurrency: budgetCurrency.trim() || 'CNY',
        deadlineAt: deadlineAt ? new Date(deadlineAt).getTime() : undefined,
        tags: parseTaskTags(tags),
      })
      const published = await publishCommunityTask(created.id)
      notifyCommunityUserDataChanged()
      onCreated?.()
      setSuccess(buildTaskPublishSuccessMessage(published.status, requireReview))
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发布任务失败'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  return (
    <CommunityPublishModalShell
      title={requireReview ? '提交任务审核' : '发布任务'}
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '提交中…' : success ? '关闭' : submitLabel}
          confirmDisabled={submitting}
          onConfirm={() => (success ? handleClose() : void handleSubmit())}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {success ? <CommunityPublishModalNotice message={success} /> : null}

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          任务标题 <span className="tm-community-publish-required">*</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：开发 Toolman MCP 插件"
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">任务描述</span>
        <textarea
          className="tm-community-publish-textarea"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="说明任务目标、交付要求与验收标准..."
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">任务类型</span>
        <select
          className="tm-community-publish-input tm-community-publish-input--select"
          value={taskType}
          onChange={(event) => setTaskType(event.target.value as CommunityTaskType)}
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
          <span className="tm-community-publish-label">预算</span>
          <input
            type="number"
            className="tm-community-publish-input"
            min="0"
            step="1"
            value={budgetAmount}
            onChange={(event) => setBudgetAmount(event.target.value)}
          />
        </label>
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">币种</span>
          <input
            type="text"
            className="tm-community-publish-input tm-community-publish-input--medium"
            value={budgetCurrency}
            onChange={(event) => setBudgetCurrency(event.target.value)}
          />
        </label>
      </div>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          截止日期 <span className="tm-community-publish-label-optional">(可选)</span>
        </span>
        <input
          type="datetime-local"
          className="tm-community-publish-input"
          value={deadlineAt}
          onChange={(event) => setDeadlineAt(event.target.value)}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">标签</span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="用逗号分隔，例如：rust, electron"
        />
      </label>
    </CommunityPublishModalShell>
  )
}
