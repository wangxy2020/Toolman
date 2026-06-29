import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import { getModerationReportResolveActionLabels } from '../../i18n/community-moderation-labels'
import type { PendingAction } from './admin-moderation-panel-types'

type Translate = ReturnType<typeof useI18n>['t']
type ReportActionLabels = ReturnType<typeof getModerationReportResolveActionLabels>

export function AdminModerationConfirmDialog({
  pending,
  onCancel,
  onConfirm,
  t,
  reportActionLabels,
}: {
  pending: PendingAction
  onCancel: () => void
  onConfirm: () => void
  t: Translate
  reportActionLabels: ReportActionLabels
}) {
  switch (pending.kind) {
    case 'suspend-resource':
      return (
        <ConfirmDialog
          title={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTitle')
              : t('communityPage.admin.confirms.delistResourceTitle')
          }
          message={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewResourceMessage', { title: pending.title })
              : t('communityPage.admin.confirms.delistResourceMessage', { title: pending.title })
          }
          confirmLabel={
            pending.reviewReject
              ? t('communityPage.admin.confirms.reject')
              : t('communityPage.admin.delist')
          }
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-user':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.banUserTitle')}
          message={t('communityPage.admin.confirms.banUserMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.ban')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'ban-device':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.banDeviceTitle')}
          message={t('communityPage.admin.confirms.banDeviceMessage', {
            deviceName: pending.deviceName,
            userName: pending.userName,
          })}
          confirmLabel={t('communityPage.admin.confirms.ban')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'resolve-report':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.resolveReportTitle')}
          message={t('communityPage.admin.confirms.resolveReportMessage', {
            action: reportActionLabels[pending.action],
          })}
          confirmLabel={t('communityPage.admin.confirm')}
          danger={pending.action !== 'dismiss_report'}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'delete-message':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.deleteMessageTitle')}
          message={t('communityPage.admin.confirms.deleteMessageMessage', { preview: pending.preview })}
          confirmLabel={t('communityPage.admin.delete')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'cancel-task':
      return (
        <ConfirmDialog
          title={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTitle')
              : t('communityPage.admin.confirms.cancelTaskTitle')
          }
          message={
            pending.reviewReject
              ? t('communityPage.admin.confirms.rejectReviewTaskMessage', { title: pending.title })
              : t('communityPage.admin.confirms.cancelTaskMessage', { title: pending.title })
          }
          confirmLabel={
            pending.reviewReject
              ? t('communityPage.admin.confirms.reject')
              : t('communityPage.admin.cancelTask')
          }
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'approve-resource':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.approveResourceTitle')}
          message={t('communityPage.admin.confirms.approveResourceMessage', { title: pending.title })}
          confirmLabel={t('communityPage.admin.confirms.approve')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'approve-task':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.approveTaskTitle')}
          message={t('communityPage.admin.confirms.approveTaskMessage', { title: pending.title })}
          confirmLabel={t('communityPage.admin.confirms.approve')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'appoint-admin':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.appointAdminTitle')}
          message={t('communityPage.admin.confirms.appointAdminMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.appoint')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'revoke-admin':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.revokeAdminTitle')}
          message={t('communityPage.admin.confirms.revokeAdminMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.confirms.revoke')}
          danger
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-user':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.unbanUserTitle')}
          message={t('communityPage.admin.confirms.unbanUserMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.unban')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    case 'unban-device':
      return (
        <ConfirmDialog
          title={t('communityPage.admin.confirms.unbanDeviceTitle')}
          message={t('communityPage.admin.confirms.unbanDeviceMessage', { label: pending.label })}
          confirmLabel={t('communityPage.admin.unban')}
          onCancel={onCancel}
          onConfirm={() => void onConfirm()}
        />
      )
    default:
      return null
  }
}
