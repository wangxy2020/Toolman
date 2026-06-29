import {
  IpcChannel,
  type CommunityTaskApplication,
  type CommunityTaskApplicationAcceptInput,
  type CommunityTaskApplicationsListInput,
  type CommunityTaskApplyInput,
  type CommunityTaskCreateInput,
  type CommunityTaskDeliverInput,
  type CommunityTaskDelivery,
  type CommunityTaskItem,
  type CommunityTaskListInput,
  type CommunityTaskListOutput,
  type CommunityTaskPatchInput,
  type CommunityTaskRejectDeliveryInput,
  type CommunityTaskReviewCreateInput,
  type CommunityTaskReviewItem,
  type CommunityTaskReviewListInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function listCommunityTasks(
  input: CommunityTaskListInput = {},
): Promise<CommunityTaskListOutput> {
  return invokeIpc(IpcChannel.CommunityTaskList, input)
}

export async function getCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskGet, { id })
}

export async function createCommunityTask(
  input: CommunityTaskCreateInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskCreate, input)
}

export async function patchCommunityTask(
  input: CommunityTaskPatchInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskPatch, input)
}

export async function publishCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskPublish, { id })
}

export async function cancelCommunityTask(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskCancel, { id })
}

export async function deleteCommunityTask(id: string): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityTaskDelete, { id })
}

export async function applyCommunityTask(
  input: CommunityTaskApplyInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityTaskApply, input)
}

export async function listCommunityTaskApplications(
  input: CommunityTaskApplicationsListInput,
): Promise<{ items: CommunityTaskApplication[] }> {
  return invokeIpc(IpcChannel.CommunityTaskApplicationsList, input)
}

export async function acceptCommunityTaskApplication(
  input: CommunityTaskApplicationAcceptInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskApplicationAccept, input)
}

export async function deliverCommunityTask(
  input: CommunityTaskDeliverInput,
): Promise<CommunityTaskDelivery> {
  return invokeIpc(IpcChannel.CommunityTaskDeliver, input)
}

export async function acceptCommunityTaskDelivery(id: string): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskAcceptDelivery, { id })
}

export async function rejectCommunityTaskDelivery(
  input: CommunityTaskRejectDeliveryInput,
): Promise<CommunityTaskItem> {
  return invokeIpc(IpcChannel.CommunityTaskRejectDelivery, input)
}

export async function createCommunityTaskReview(
  input: CommunityTaskReviewCreateInput,
): Promise<unknown> {
  return invokeIpc(IpcChannel.CommunityTaskReviewCreate, input)
}

export async function listCommunityTaskReviews(
  input: CommunityTaskReviewListInput,
): Promise<{ items: CommunityTaskReviewItem[] }> {
  return invokeIpc(IpcChannel.CommunityTaskReviewList, input)
}
