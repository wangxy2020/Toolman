import { formatCommunityDate } from './community-market-utils'
import { getDefaultReportResolveAction } from './community-moderation-utils'
import { ModerationList } from './ModerationList'
import { ModerationReviewQueue } from './ModerationReviewQueue'
import type { AdminModerationPanelState } from './useAdminModerationPanel'
import type { PendingAction } from './admin-moderation-panel-types'

type PanelSlice = Pick<
  AdminModerationPanelState,
  | 't'
  | 'language'
  | 'category'
  | 'subTab'
  | 'scan'
  | 'moderation'
  | 'reportTargetLabels'
  | 'reportReasonLabels'
  | 'reportActionLabels'
>

export function AdminModerationReviewSection({
  panel,
  setPending,
}: {
  panel: PanelSlice
  setPending: (action: PendingAction) => void
}) {
  const {
    t,
    language,
    category,
    subTab,
    scan,
    moderation,
    reportTargetLabels,
    reportReasonLabels,
    reportActionLabels,
  } = panel

  if (category !== 'review') return null

  if (subTab === 'pending') {
    return (
      <ModerationReviewQueue
        resources={scan?.pendingReview ?? []}
        tasks={scan?.pendingReviewTasks ?? []}
        acting={moderation.acting}
        onApproveResource={(resource) =>
          setPending({
            kind: 'approve-resource',
            resourceId: resource.id,
            title: resource.title,
          })
        }
        onRejectResource={(resource) =>
          setPending({
            kind: 'suspend-resource',
            resourceId: resource.id,
            title: resource.title,
            reviewReject: true,
          })
        }
        onApproveTask={(task) =>
          setPending({
            kind: 'approve-task',
            taskId: task.id,
            title: task.title,
          })
        }
        onRejectTask={(task) =>
          setPending({
            kind: 'cancel-task',
            taskId: task.id,
            title: task.title,
            reviewReject: true,
          })
        }
      />
    )
  }

  if (subTab === 'reports') {
    return (
      <ModerationList
        empty={t('communityPage.admin.emptyReports')}
        items={scan?.openReports ?? []}
        renderItem={(report) => {
          const defaultAction = getDefaultReportResolveAction(report.targetType)
          return (
            <div key={report.id} className="tm-community-moderation-row">
              <div className="tm-community-moderation-row-main">
                <div className="tm-community-moderation-row-title">
                  {reportTargetLabels[report.targetType]} · {reportReasonLabels[report.reason]}
                </div>
                <div className="tm-community-moderation-row-meta">
                  {t('communityPage.admin.targetId', {
                    id: report.targetId,
                    time: formatCommunityDate(report.createdAt, language),
                  })}
                </div>
                {report.description.trim() ? (
                  <div className="tm-community-moderation-row-meta">{report.description}</div>
                ) : null}
              </div>
              <div className="tm-community-moderation-row-actions">
                <button
                  type="button"
                  className="tm-btn tm-btn--ghost tm-community-moderation-btn-danger"
                  disabled={moderation.acting}
                  onClick={() =>
                    setPending({
                      kind: 'resolve-report',
                      report,
                      action: defaultAction,
                    })
                  }
                >
                  {reportActionLabels[defaultAction]}
                </button>
                <button
                  type="button"
                  className="tm-btn tm-btn--ghost"
                  disabled={moderation.acting}
                  onClick={() =>
                    setPending({
                      kind: 'resolve-report',
                      report,
                      action: 'dismiss_report',
                    })
                  }
                >
                  {t('communityPage.admin.reject')}
                </button>
              </div>
            </div>
          )
        }}
      />
    )
  }

  return null
}
