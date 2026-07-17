import {
  IpcChannel,
  type CommunityTaskCreateInput,
  type CommunityTaskItem,
  type CommunityTaskListInput,
  type CommunityTaskListOutput,
  type CommunityTaskPatchInput,
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
