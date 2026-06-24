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

  const submitLabel = editOnly ? '保存修改' : requireReview ? '提交审核' : '发布任务'

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
      setError('请填写任务标题')
      return
    }

    setSubmitting(true)
    setError(null)
    let createdId: string | undefined = resumeTask?.id
    try {
      if (editOnly && resumeTask) {
        await patchCommunityTask(buildPatchInput(resumeTask.id))
        notifyCommunityUserDataChanged()
        onCreated?.('修改已保存')
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
      onCreated?.(buildTaskPublishSuccessMessage(published.status, requireReview))
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发布任务失败'
      if (createdId) {
        try {
          const existing = await getCommunityTask(createdId)
          if (existing.status === 'pending_review' || existing.status === 'open') {
            notifyCommunityUserDataChanged()
            onCreated?.(buildTaskPublishSuccessMessage(existing.status, requireReview))
            onClose()
            return
          }
        } catch {
          // fall through to error display
        }
      }
      setError(
        createdId && !isResume
          ? `${message}。任务已保存为草稿，请返回任务市场重新提交审核。`
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

  return (
    <CommunityPublishModalShell
      title={
        editOnly
          ? '修改任务'
          : isRejected
            ? '重新提交任务审核'
            : isResume
              ? '继续提交任务审核'
              : requireReview
                ? '提交任务审核'
                : '发布任务'
      }
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? '提交中…' : submitLabel}
          confirmDisabled={submitting}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {isDraftResume && !editOnly ? (
        <CommunityPublishModalNotice message="上次提交未完成发布。请确认信息后重新提交，管理员才能看到待审核条目。" />
      ) : null}
      {isRejected && !editOnly ? (
        <CommunityPublishModalNotice message="审核未通过。请修改任务信息后重新提交审核。" />
      ) : null}
      {editOnly ? (
        <CommunityPublishModalNotice message="修改任务基本信息后保存；确认无误后可使用「重新提交」再次送审。" />
      ) : null}

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
          readOnly={readOnlyFields}
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
          readOnly={readOnlyFields}
        />
      </label>

      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">任务类型</span>
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
          <span className="tm-community-publish-label">预算</span>
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
          <span className="tm-community-publish-label">币种</span>
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
          截止日期 <span className="tm-community-publish-label-optional">(可选)</span>
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
        <span className="tm-community-publish-label">标签</span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="用逗号分隔，例如：rust, electron"
          readOnly={readOnlyFields}
        />
      </label>
    </CommunityPublishModalShell>
  )
}
