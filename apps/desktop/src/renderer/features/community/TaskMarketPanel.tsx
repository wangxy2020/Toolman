import { useMemo, useState } from 'react'

import { type CommunityTaskItem } from '@toolman/shared'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconTaskList } from '../../components/icons'
import { deleteCommunityTask, listCommunityTasks } from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { isUiMockCommunityId } from './community-ui-mock'
import { getUiMockInteractionDefaults } from './community-ui-mock-interactions'
import { buildTaskCommentTarget } from './community-comment-utils'
import { formatNewsDate } from './community-news-utils'
import { sortCommunityListItems } from './community-list-sort'
import {
  formatTaskBudget,
} from './community-task-utils'
import { canDeleteCommunityResource } from './community-user-utils'
import { CommunityCommentListItemShell } from './CommunityCommentListItemShell'
import { CommunityListFileCard } from './CommunityListFileCard'
import { CommunityListPanelShell } from './CommunityListPanelShell'
import { copyCommunityShareText } from './community-share-utils'
import { TaskCreateModal } from './TaskCreateModal'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityListSortContext } from './CommunityListSortContext'
import { useCommunityLocalInteractions } from './useCommunityLocalInteractions'
import { useCommunityHubConnection } from './useCommunityHubConnection'
import { useCommunityTasks } from './useCommunityTasks'
import { useCommunityUser } from './useCommunityUser'
import { useCommunityPanelStatus } from './community-panel-status'
import { useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useI18n } from '../../i18n/useI18n'
import {
  getCommunityTaskStatusLabel,
  getCommunityTaskTypeLabel,
} from '../../i18n/community-status-labels'

export function TaskMarketPanel() {
  const { t, language } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [resumeTask, setResumeTask] = useState<CommunityTaskItem | null>(null)
  const [publishNotice, setPublishNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<CommunityTaskItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { sortField, sortAscending } = useCommunityListSortContext()
  const comments = useCommunityCommentExpansion()
  const localInteractions = useCommunityLocalInteractions()

  const tasks = useCommunityTasks({ query: useMemo(() => ({}), []) })
  const { status: hubStatus } = useCommunityHubConnection()
  const user = useCommunityUser()
  const { requireRegistration } = useRegistrationGate()

  const hubWriteBlocked = hubStatus?.offlineReadOnly === true
  const publishDisabled = hubWriteBlocked || user.profile?.canPublish === false

  useCommunityPanelStatus('community-tasks', {
    loading: tasks.loading,
    error: tasks.error,
    onClearError: () => tasks.setError(null),
  })
  useCommunityPanelStatus('community-tasks-user', {
    error: user.error,
  })
  useRegisterModulePanelStatus(
    'community-tasks-publish',
    publishNotice
      ? {
          tone: 'info',
          message: publishNotice,
          onDismiss: () => setPublishNotice(null),
        }
      : null,
    () => setPublishNotice(null),
  )

  const sortedItems = useMemo(
    () =>
      sortCommunityListItems(
        tasks.items.map((task) => ({
          ...task,
          title: task.title,
          createdAt: task.createdAt,
          sizeBytes: task.description.length,
        })),
        sortField,
        sortAscending,
      ),
    [tasks.items, sortAscending, sortField],
  )

  const handleChanged = async () => {
    await tasks.load()
  }

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return

    const taskId = taskToDelete.id
    setDeletingId(taskId)
    try {
      if (!isUiMockCommunityId(taskId)) {
        await deleteCommunityTask(taskId)
        notifyCommunityUserDataChanged()
      }
      setTaskToDelete(null)
      if (selectedId === taskId) setSelectedId(null)
      await tasks.load()
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : t('communityPage.market.deleteTaskFailed')
      tasks.setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <CommunityListPanelShell
        title={t('communityPage.panels.tasks.title')}
        subtitle={t('communityPage.panels.tasks.subtitle')}
        publishLabel={t('communityPage.panels.tasks.publish')}
        loading={tasks.loading}
        onRefresh={() => void tasks.load()}
        onPublish={() => {
          if (!requireRegistration('community_write')) return
          void (async () => {
            setPublishNotice(null)
            const profile = user.profile
            if (!profile?.id) {
              setResumeTask(null)
              setShowCreate(true)
              return
            }
            try {
              const mine = await listCommunityTasks({ publisherId: profile.id, limit: 50 })
              const pending = mine.items.find((item) => item.status === 'pending_review')
              if (pending) {
                setPublishNotice(
                  t('communityPage.market.pendingTaskReview', { title: pending.title }),
                )
                return
              }
              const draft = mine.items.find((item) => item.status === 'draft')
              const rejected = mine.items.find((item) => item.status === 'rejected')
              setResumeTask(rejected ?? draft ?? null)
              setShowCreate(true)
            } catch {
              setResumeTask(null)
              setShowCreate(true)
            }
          })()
        }}
        publishDisabled={publishDisabled}
        isEmpty={sortedItems.length === 0}
        emptyHint={t('communityPage.panels.tasks.empty')}
      >
        <ul className="tm-kb-file-list">
          {sortedItems.map((task) => {
            const mockDefaults = isUiMockCommunityId(task.id)
              ? getUiMockInteractionDefaults(task.id)
              : null
            const resolved = localInteractions.resolve(
              task.id,
              mockDefaults?.state,
              mockDefaults?.counts,
            )
            const canDelete =
              canDeleteCommunityResource(task.publisher.id, user.profile) &&
              task.status !== 'cancelled' &&
              task.status !== 'completed'
            const commentTarget = buildTaskCommentTarget(task.id)

            return (
              <CommunityCommentListItemShell
                key={task.id}
                commentTarget={commentTarget}
                comments={comments}
                counts={resolved.counts}
                state={resolved.state}
                busyAction={deletingId === task.id ? 'delete' : null}
                reportTarget={{ targetType: 'task', targetId: task.id }}
                onDelete={canDelete ? () => setTaskToDelete(task) : undefined}
                onLike={() => localInteractions.like(task.id, resolved.state, resolved.counts)}
                onDislike={() =>
                  localInteractions.dislike(task.id, resolved.state, resolved.counts)
                }
                onFavorite={() =>
                  localInteractions.favorite(task.id, resolved.state, resolved.counts)
                }
                onShare={() =>
                  void copyCommunityShareText(
                    t('communityPage.market.shareTask', {
                      title: task.title,
                      description: task.description,
                      budget: formatTaskBudget(task.budgetAmount, task.budgetCurrency, t, language),
                    }),
                  )
                }
              >
                <CommunityListFileCard
                  title={task.title}
                  meta={buildTaskMeta(task, t, language)}
                  description={task.description || undefined}
                  selected={selectedId === task.id}
                  onClick={() => setSelectedId((current) => (current === task.id ? null : task.id))}
                  icon={<IconTaskList size={18} />}
                />
              </CommunityCommentListItemShell>
            )
          })}
        </ul>
      </CommunityListPanelShell>

      {showCreate ? (
        <TaskCreateModal
          resumeTask={resumeTask}
          onClose={() => {
            setShowCreate(false)
            setResumeTask(null)
          }}
          onCreated={(message) => {
            setPublishNotice(message)
            setResumeTask(null)
            setShowCreate(false)
            void handleChanged()
          }}
        />
      ) : null}

      {taskToDelete ? (
        <ConfirmDialog
          title={t('communityPage.market.deleteTaskTitle')}
          message={t('communityPage.market.deleteTaskMessage', { title: taskToDelete.title })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </>
  )
}

function buildTaskMeta(
  task: CommunityTaskItem,
  t: ReturnType<typeof useI18n>['t'],
  language: ReturnType<typeof useI18n>['language'],
) {
  return (
    <>
      <span>{getCommunityTaskStatusLabel(task.status, t)}</span>
      <span>·</span>
      <span>{getCommunityTaskTypeLabel(task.taskType, t)}</span>
      <span>·</span>
      <span>{formatTaskBudget(task.budgetAmount, task.budgetCurrency, t, language)}</span>
      <span>·</span>
      <span>{task.publisher.displayName}</span>
      <span>·</span>
      <span>{formatNewsDate(task.createdAt)}</span>
    </>
  )
}
