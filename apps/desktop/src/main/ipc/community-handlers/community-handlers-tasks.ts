import { IpcChannel } from '@toolman/shared'
import {
  acceptTaskApplication,
  acceptTaskDelivery,
  applyTask,
  approveModerationResource,
  approveModerationTask,
  appointCommunityAdmin,
  banModerationDevice,
  banModerationUser,
  cancelTask,
  createModerationReport,
  createOrder,
  createTask,
  createTaskReview,
  deleteTask,
  deliverTask,
  getOrder,
  getTask,
  listCommunityAdmins,
  listModerationLogs,
  listModerationReports,
  listTaskApplications,
  listTaskReviews,
  listTasks,
  patchTask,
  publishTask,
  rejectModerationTask,
  rejectTaskDelivery,
  resolveModerationReport,
  revokeCommunityAdmin,
  scanModerationOnline,
  searchCommunityUsers,
  suspendModerationResource,
  touchCommunityPresenceHeartbeat,
  unbanModerationDevice,
  unbanModerationUser,
  updateOrderStatus,
} from '../../services/community/community-ipc.facade'
import { communityHandler } from './community-handlers-utils'
import type { HandlerFn } from './community-handlers-utils'

export const communityTasksHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.CommunityTaskList]: communityHandler((input) => listTasks(input)),
  [IpcChannel.CommunityTaskGet]: communityHandler((input) => getTask(input)),
  [IpcChannel.CommunityTaskCreate]: communityHandler((input) => createTask(input)),
  [IpcChannel.CommunityTaskPatch]: communityHandler((input) => patchTask(input)),
  [IpcChannel.CommunityTaskPublish]: communityHandler((input) => publishTask(input)),
  [IpcChannel.CommunityTaskCancel]: communityHandler((input) => cancelTask(input)),
  [IpcChannel.CommunityTaskDelete]: communityHandler((input) => deleteTask(input)),
  [IpcChannel.CommunityTaskApply]: communityHandler((input) => applyTask(input)),
  [IpcChannel.CommunityTaskApplicationsList]: communityHandler((input) =>
    listTaskApplications(input),
  ),
  [IpcChannel.CommunityTaskApplicationAccept]: communityHandler((input) =>
    acceptTaskApplication(input),
  ),
  [IpcChannel.CommunityTaskDeliver]: communityHandler((input) => deliverTask(input)),
  [IpcChannel.CommunityTaskAcceptDelivery]: communityHandler((input) =>
    acceptTaskDelivery(input),
  ),
  [IpcChannel.CommunityTaskRejectDelivery]: communityHandler((input) =>
    rejectTaskDelivery(input),
  ),
  [IpcChannel.CommunityTaskReviewCreate]: communityHandler((input) => createTaskReview(input)),
  [IpcChannel.CommunityTaskReviewList]: communityHandler((input) => listTaskReviews(input)),

  [IpcChannel.CommunityOrderCreate]: communityHandler((input) => createOrder(input)),
  [IpcChannel.CommunityOrderGet]: communityHandler((input) => getOrder(input)),
  [IpcChannel.CommunityOrderUpdateStatus]: communityHandler((input) => updateOrderStatus(input)),

  [IpcChannel.CommunityModerationReport]: communityHandler((input) => createModerationReport(input)),
  [IpcChannel.CommunityModerationReportList]: communityHandler((input) =>
    listModerationReports(input),
  ),
  [IpcChannel.CommunityModerationReportResolve]: communityHandler((input) =>
    resolveModerationReport(input),
  ),
  [IpcChannel.CommunityModerationResourceSuspend]: communityHandler((input) =>
    suspendModerationResource(input),
  ),
  [IpcChannel.CommunityModerationResourceApprove]: communityHandler((input) =>
    approveModerationResource(input),
  ),
  [IpcChannel.CommunityModerationTaskApprove]: communityHandler((input) =>
    approveModerationTask(input),
  ),
  [IpcChannel.CommunityModerationTaskReject]: communityHandler((input) =>
    rejectModerationTask(input),
  ),
  [IpcChannel.CommunityModerationUserBan]: communityHandler((input) => banModerationUser(input)),
  [IpcChannel.CommunityModerationUserUnban]: communityHandler((input) => unbanModerationUser(input)),
  [IpcChannel.CommunityModerationDeviceBan]: communityHandler((input) => banModerationDevice(input)),
  [IpcChannel.CommunityModerationDeviceUnban]: communityHandler((input) =>
    unbanModerationDevice(input),
  ),
  [IpcChannel.CommunityModerationLogsList]: communityHandler((input) => listModerationLogs(input)),
  [IpcChannel.CommunityModerationScan]: communityHandler(() => scanModerationOnline()),
  [IpcChannel.CommunityPresenceHeartbeat]: communityHandler(() =>
    touchCommunityPresenceHeartbeat(),
  ),

  [IpcChannel.CommunityAdminList]: communityHandler(() => listCommunityAdmins()),
  [IpcChannel.CommunityAdminSearch]: communityHandler((input) => searchCommunityUsers(input)),
  [IpcChannel.CommunityAdminAppoint]: communityHandler((input) => appointCommunityAdmin(input)),
  [IpcChannel.CommunityAdminRevoke]: communityHandler((input) => revokeCommunityAdmin(input)),
}
