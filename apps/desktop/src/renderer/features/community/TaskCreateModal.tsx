import { useEffect, useState } from 'react'

import { type CommunityTaskType } from '@toolman/shared'

import { createCommunityTask, publishCommunityTask } from './community-api.client'
import { parseTaskTags, TASK_TYPE_LABELS } from './community-task-utils'

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写任务标题')
      return
    }

    setSubmitting(true)
    setError(null)
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
      await publishCommunityTask(created.id)
      onCreated?.()
      onClose()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '发布任务失败'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--narrow tm-modal--form" onClick={(event) => event.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">发布任务</h2>
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
              placeholder="例如：开发 Toolman MCP 插件"
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">描述</span>
            <textarea
              className="tm-form-textarea"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="说明任务目标、交付要求与验收标准"
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">类型</span>
            <select
              className="tm-form-input"
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

          <div className="tm-community-task-form-row">
            <label className="tm-form-field">
              <span className="tm-form-label">预算</span>
              <input
                className="tm-form-input"
                type="number"
                min="0"
                step="1"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
              />
            </label>
            <label className="tm-form-field">
              <span className="tm-form-label">币种</span>
              <input
                className="tm-form-input"
                value={budgetCurrency}
                onChange={(event) => setBudgetCurrency(event.target.value)}
              />
            </label>
          </div>

          <label className="tm-form-field">
            <span className="tm-form-label">截止日期</span>
            <input
              className="tm-form-input"
              type="datetime-local"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
            />
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">标签</span>
            <input
              className="tm-form-input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="用逗号分隔，例如：rust, electron"
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
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '发布中…' : '发布任务'}
          </button>
        </div>
      </div>
    </div>
  )
}
