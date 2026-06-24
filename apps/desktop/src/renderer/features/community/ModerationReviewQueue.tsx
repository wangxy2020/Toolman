import { useRef, useState, type ReactNode } from 'react'

import {
  type CommunityModerationScanResource,
  type CommunityModerationScanTask,
  type CommunityResourceType,
} from '@toolman/shared'

import {
  IconComment,
  IconDownload,
  IconFolder,
  IconKnowledge,
  IconMcp,
  IconSkill,
  IconTaskList,
  IconWorkflow,
} from '../../components/icons'
import { CommunityCommentDropdown } from './CommunityCommentDropdown'
import {
  downloadCommunityResourcePackageForReview,
  openCommunityResourcePackageForReview,
} from './community-api.client'
import { buildResourceCommentTarget, buildTaskCommentTarget } from './community-comment-utils'
import { formatCommunityDate } from './community-market-utils'
import { RESOURCE_SUB_TAB_LABELS } from './community-moderation-utils'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { TaskReviewDetailModal } from './TaskReviewDetailModal'

const RESOURCE_ICONS: Partial<Record<CommunityResourceType, ReactNode>> = {
  mcp: <IconMcp size={18} />,
  skill: <IconSkill size={18} />,
  workflow: <IconWorkflow size={18} />,
  knowledge: <IconKnowledge size={18} />,
}

type ReviewAction = 'download' | 'view' | null

interface Props {
  resources: CommunityModerationScanResource[]
  tasks: CommunityModerationScanTask[]
  acting: boolean
  onApproveResource: (resource: CommunityModerationScanResource) => void
  onRejectResource: (resource: CommunityModerationScanResource) => void
  onApproveTask: (task: CommunityModerationScanTask) => void
  onRejectTask: (task: CommunityModerationScanTask) => void
}

function ReviewActionButton({
  label,
  disabled,
  active,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={[
        'tm-community-card-action',
        'tm-community-card-action--review',
        active ? 'tm-community-card-action--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      {children}
      <span className="tm-community-card-action-label">{label}</span>
    </button>
  )
}

function ReviewItemIcon({ children }: { children: ReactNode }) {
  return <div className="tm-community-moderation-review-icon">{children}</div>
}

function ModerationReviewResourceCard({
  resource,
  acting,
  onApprove,
  onReject,
}: {
  resource: CommunityModerationScanResource
  acting: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [busyAction, setBusyAction] = useState<ReviewAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const comments = useCommunityCommentExpansion()
  const commentTarget = buildResourceCommentTarget(resource.id)
  const commentOpen = comments.isExpanded(commentTarget)
  const typeLabel =
    RESOURCE_SUB_TAB_LABELS[resource.resourceType as keyof typeof RESOURCE_SUB_TAB_LABELS] ??
    resource.resourceType

  const runPackageAction = async (kind: 'download' | 'view', runner: () => Promise<unknown>) => {
    setActionError(null)
    setBusyAction(kind)
    try {
      const result = (await runner()) as { opened?: boolean; saved?: boolean; error?: string }
      if (result.error) {
        setActionError(result.error)
      } else if (kind === 'view' && result.opened === false) {
        setActionError('无法打开资源包目录')
      } else if (kind === 'download' && result.saved === false) {
        setActionError(null)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <li className="tm-community-moderation-review-item">
      <div className="tm-community-moderation-review-body">
        <ReviewItemIcon>{RESOURCE_ICONS[resource.resourceType]}</ReviewItemIcon>
        <div className="tm-community-moderation-review-main">
          <div className="tm-community-moderation-row-title">{resource.title}</div>
          <div className="tm-community-moderation-row-meta">
            {typeLabel} · {resource.authorName} · {formatCommunityDate(resource.createdAt)}
          </div>
        </div>
      </div>
      <div
        className="tm-community-moderation-review-toolbar tm-community-moderation-review-actions"
        ref={actionsRef}
      >
        <div className="tm-community-list-card-actions-start">
          <ReviewActionButton
            label="下载"
            disabled={acting || busyAction != null}
            onClick={() =>
              void runPackageAction('download', () =>
                downloadCommunityResourcePackageForReview(resource.id),
              )
            }
          >
            <IconDownload size={14} className="tm-community-card-action-svg" />
          </ReviewActionButton>
          <ReviewActionButton
            label="查看"
            disabled={acting || busyAction != null}
            onClick={() =>
              void runPackageAction('view', () => openCommunityResourcePackageForReview(resource.id))
            }
          >
            <IconFolder size={14} className="tm-community-card-action-svg" />
          </ReviewActionButton>
          <ReviewActionButton
            label="批注"
            active={commentOpen}
            disabled={acting}
            onClick={() => comments.toggleExpanded(commentTarget)}
          >
            <IconComment size={14} className="tm-community-card-action-svg" />
          </ReviewActionButton>
        </div>
        <div className="tm-community-list-card-actions-main tm-community-moderation-review-decisions">
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={acting}
            onClick={onApprove}
          >
            通过
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
            disabled={acting}
            onClick={onReject}
          >
            拒绝
          </button>
        </div>
      </div>
      {actionError ? (
        <p className="tm-community-moderation-review-error">{actionError}</p>
      ) : null}
      <CommunityCommentDropdown
        anchorRef={actionsRef}
        target={commentTarget}
        open={commentOpen}
        onClose={() => comments.toggleExpanded(commentTarget)}
        onCountChange={(count) => comments.setCount(commentTarget, count)}
      />
    </li>
  )
}

function ModerationReviewTaskCard({
  task,
  acting,
  onApprove,
  onReject,
}: {
  task: CommunityModerationScanTask
  acting: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const comments = useCommunityCommentExpansion()
  const commentTarget = buildTaskCommentTarget(task.id)
  const commentOpen = comments.isExpanded(commentTarget)

  return (
    <li className="tm-community-moderation-review-item">
      <div className="tm-community-moderation-review-body">
        <ReviewItemIcon>
          <IconTaskList size={18} />
        </ReviewItemIcon>
        <div className="tm-community-moderation-review-main">
          <div className="tm-community-moderation-row-title">{task.title}</div>
          <div className="tm-community-moderation-row-meta">
            任务 · {task.publisherName} · {formatCommunityDate(task.createdAt)}
          </div>
        </div>
      </div>
      <div
        className="tm-community-moderation-review-toolbar tm-community-moderation-review-actions"
        ref={actionsRef}
      >
        <div className="tm-community-list-card-actions-start">
          <ReviewActionButton
            label="查看"
            disabled={acting}
            onClick={() => setDetailOpen(true)}
          >
            <IconFolder size={14} className="tm-community-card-action-svg" />
          </ReviewActionButton>
          <ReviewActionButton
            label="批注"
            active={commentOpen}
            disabled={acting}
            onClick={() => comments.toggleExpanded(commentTarget)}
          >
            <IconComment size={14} className="tm-community-card-action-svg" />
          </ReviewActionButton>
        </div>
        <div className="tm-community-list-card-actions-main tm-community-moderation-review-decisions">
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={acting}
            onClick={onApprove}
          >
            通过
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
            disabled={acting}
            onClick={onReject}
          >
            拒绝
          </button>
        </div>
      </div>
      <CommunityCommentDropdown
        anchorRef={actionsRef}
        target={commentTarget}
        open={commentOpen}
        onClose={() => comments.toggleExpanded(commentTarget)}
        onCountChange={(count) => comments.setCount(commentTarget, count)}
      />
      {detailOpen ? (
        <TaskReviewDetailModal taskId={task.id} onClose={() => setDetailOpen(false)} />
      ) : null}
    </li>
  )
}

export function ModerationReviewQueue({
  resources,
  tasks,
  acting,
  onApproveResource,
  onRejectResource,
  onApproveTask,
  onRejectTask,
}: Props) {
  if (resources.length === 0 && tasks.length === 0) {
    return <div className="tm-user-center-empty">暂无待审核内容</div>
  }

  return (
    <>
      <p className="tm-community-moderation-review-hint">
        审核资源时可点击「查看」在本地打开资源包文件夹，「下载」保存副本；审核任务时点击「查看」阅读任务详情。「批注」填写的意见会展示在发布者「我的」页面。
      </p>
      <ul className="tm-kb-file-list tm-community-moderation-review-list">
      {resources.map((resource) => (
        <ModerationReviewResourceCard
          key={`resource-${resource.id}`}
          resource={resource}
          acting={acting}
          onApprove={() => onApproveResource(resource)}
          onReject={() => onRejectResource(resource)}
        />
      ))}
      {tasks.map((task) => (
        <ModerationReviewTaskCard
          key={`task-${task.id}`}
          task={task}
          acting={acting}
          onApprove={() => onApproveTask(task)}
          onReject={() => onRejectTask(task)}
        />
      ))}
      </ul>
    </>
  )
}
