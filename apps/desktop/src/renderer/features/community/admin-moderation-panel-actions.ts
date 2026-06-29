import type { PendingAction } from './admin-moderation-panel-types'
import type { useCommunityAdminManagement } from './useCommunityAdminManagement'
import type { useCommunityModeration } from './useCommunityModeration'

export async function executeAdminModerationPendingAction(
  pending: PendingAction,
  moderation: ReturnType<typeof useCommunityModeration>,
  adminManagement: ReturnType<typeof useCommunityAdminManagement>,
) {
  switch (pending.kind) {
    case 'suspend-resource':
      await moderation.suspendResource(pending.resourceId, '管理员审核拒绝')
      break
    case 'ban-user':
      await moderation.banUser(pending.userId, '管理员封禁恶意用户', 168)
      break
    case 'ban-device':
      await moderation.banDevice({
        deviceId: pending.deviceId,
        userId: pending.userId,
        deviceName: pending.deviceName,
        reason: '管理员封禁设备',
        durationHours: 168,
      })
      break
    case 'resolve-report':
      await moderation.resolveReport(pending.report.id, pending.action, '管理员处理举报')
      break
    case 'delete-message':
      await moderation.deleteMessage(pending.messageId)
      break
    case 'cancel-task':
      if (pending.reviewReject) {
        await moderation.rejectTask(pending.taskId, '管理员审核拒绝')
      } else {
        await moderation.cancelTask(pending.taskId)
      }
      break
    case 'approve-resource':
      await moderation.approveResource(pending.resourceId, '管理员审核通过')
      break
    case 'approve-task':
      await moderation.approveTask(pending.taskId, '管理员审核通过')
      break
    case 'appoint-admin':
      await adminManagement.appointAdmin(pending.userId)
      break
    case 'revoke-admin':
      await adminManagement.revokeAdmin(pending.userId)
      break
    case 'unban-user':
      await moderation.unbanUser(pending.userId)
      break
    case 'unban-device':
      await moderation.unbanDevice(pending.deviceId)
      break
  }
}
