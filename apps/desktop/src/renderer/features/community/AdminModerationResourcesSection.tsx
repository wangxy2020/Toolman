import { formatCommunityDate } from './community-market-utils'
import { formatBoardMessageTitle, formatNewsPreview } from './community-news-utils'
import { ModerationList } from './ModerationList'
import { filterResourcesByType, isResourceSubTab } from './admin-moderation-panel-utils'
import type { AdminModerationPanelState } from './useAdminModerationPanel'
import type { PendingAction } from './admin-moderation-panel-types'

type PanelSlice = Pick<
  AdminModerationPanelState,
  't' | 'language' | 'category' | 'subTab' | 'scan' | 'moderation' | 'resourceSubTabLabels'
>

export function AdminModerationResourcesSection({
  panel,
  setPending,
}: {
  panel: PanelSlice
  setPending: (action: PendingAction) => void
}) {
  const { t, language, category, subTab, scan, moderation, resourceSubTabLabels } = panel

  if (category !== 'resources') return null

  if (subTab === 'messages') {
    return (
      <ModerationList
        empty={t('communityPage.admin.emptyMessages')}
        items={scan?.recentMessages ?? []}
        renderItem={(message) => (
          <div key={message.id} className="tm-community-moderation-row">
            <div className="tm-community-moderation-row-main">
              <div className="tm-community-moderation-row-title">
                {formatBoardMessageTitle(message.body)}
              </div>
              <div className="tm-community-moderation-row-meta">
                {message.authorName} · {formatCommunityDate(message.createdAt, language)}
              </div>
              <div className="tm-community-moderation-row-desc">{formatNewsPreview(message.body)}</div>
            </div>
            <div className="tm-community-moderation-row-actions">
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'delete-message',
                    messageId: message.id,
                    preview: formatBoardMessageTitle(message.body),
                  })
                }
              >
                {t('communityPage.admin.delete')}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'ban-user',
                    userId: message.userId,
                    label: message.authorName,
                  })
                }
              >
                {t('communityPage.admin.banPublisher')}
              </button>
            </div>
          </div>
        )}
      />
    )
  }

  if (isResourceSubTab(subTab) && subTab !== 'tasks') {
    return (
      <ModerationList
        empty={t('communityPage.admin.emptyOnline', { type: resourceSubTabLabels[subTab] })}
        items={filterResourcesByType(scan?.onlineResources ?? [], subTab)}
        renderItem={(resource) => (
          <div key={resource.id} className="tm-community-moderation-row">
            <div className="tm-community-moderation-row-main">
              <div className="tm-community-moderation-row-title">{resource.title}</div>
              <div className="tm-community-moderation-row-meta">
                {resource.resourceType} · {resource.status} · {resource.authorName} ·{' '}
                {formatCommunityDate(resource.createdAt, language)}
              </div>
            </div>
            <div className="tm-community-moderation-row-actions">
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'suspend-resource',
                    resourceId: resource.id,
                    title: resource.title,
                  })
                }
              >
                {t('communityPage.admin.delist')}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'ban-user',
                    userId: resource.authorId,
                    label: resource.authorName,
                  })
                }
              >
                {t('communityPage.admin.banPublisher')}
              </button>
            </div>
          </div>
        )}
      />
    )
  }

  if (subTab === 'tasks') {
    return (
      <ModerationList
        empty={t('communityPage.admin.emptyTasks')}
        items={scan?.activeTasks ?? []}
        renderItem={(task) => (
          <div key={task.id} className="tm-community-moderation-row">
            <div className="tm-community-moderation-row-main">
              <div className="tm-community-moderation-row-title">{task.title}</div>
              <div className="tm-community-moderation-row-meta">
                {task.status} · {task.publisherName} · {formatCommunityDate(task.createdAt, language)}
              </div>
            </div>
            <div className="tm-community-moderation-row-actions">
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'cancel-task',
                    taskId: task.id,
                    title: task.title,
                  })
                }
              >
                {t('communityPage.admin.cancelTask')}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                disabled={moderation.acting}
                onClick={() =>
                  setPending({
                    kind: 'ban-user',
                    userId: task.publisherId,
                    label: task.publisherName,
                  })
                }
              >
                {t('communityPage.admin.banPublisher')}
              </button>
            </div>
          </div>
        )}
      />
    )
  }

  return null
}
