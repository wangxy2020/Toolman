import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { type CommunityTaskItem } from '@toolman/shared'

import { getCommunityTask } from './community-api.client'
import { formatCommunityDate } from './community-market-utils'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'
import {
  formatTaskBudget,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './community-task-utils'

interface Props {
  taskId: string
  onClose: () => void
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tm-community-task-review-detail-row">
      <span className="tm-community-task-review-detail-label">{label}</span>
      <span className="tm-community-task-review-detail-value">{value}</span>
    </div>
  )
}

export function TaskReviewDetailModal({ taskId, onClose }: Props) {
  const [task, setTask] = useState<CommunityTaskItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void getCommunityTask(taskId)
      .then((detail) => {
        if (!cancelled) setTask(detail)
      })
      .catch((loadError) => {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : '加载任务详情失败'
          setError(message)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [taskId])

  return createPortal(
    <CommunityPublishModalShell
      title={task?.title ?? '任务详情'}
      ariaLabel="任务审核详情"
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions cancelLabel="关闭" onCancel={onClose} />
      }
    >
      {loading ? <div className="tm-community-publish-modal-empty">加载任务详情中…</div> : null}
      {error ? <CommunityPublishModalError message={error} /> : null}
      {!loading && !error && task ? (
        <div className="tm-community-task-review-detail">
          <DetailRow label="类型" value={TASK_TYPE_LABELS[task.taskType]} />
          <DetailRow label="状态" value={TASK_STATUS_LABELS[task.status]} />
          <DetailRow
            label="预算"
            value={formatTaskBudget(task.budgetAmount, task.budgetCurrency)}
          />
          <DetailRow
            label="截止时间"
            value={task.deadlineAt ? formatCommunityDate(task.deadlineAt) : '未设置'}
          />
          <DetailRow label="发布者" value={task.publisher.displayName} />
          <DetailRow label="提交时间" value={formatCommunityDate(task.createdAt)} />
          {task.tags.length > 0 ? (
            <DetailRow label="标签" value={task.tags.join('、')} />
          ) : null}
          <div className="tm-community-task-review-detail-block">
            <div className="tm-community-task-review-detail-label">任务描述</div>
            <div className="tm-community-task-review-description">
              {task.description.trim() || '（无描述）'}
            </div>
          </div>
        </div>
      ) : null}
    </CommunityPublishModalShell>,
    document.body,
  )
}
