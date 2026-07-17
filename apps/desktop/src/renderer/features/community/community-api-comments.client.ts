import {
  IpcChannel,
  type CommunityComment,
  type CommunityCommentCreateInput,
  type CommunityCommentListInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function listCommunityComments(
  input: CommunityCommentListInput,
): Promise<{ items: CommunityComment[] }> {
  return invokeIpc(IpcChannel.CommunityCommentList, input)
}

export async function createCommunityComment(
  input: CommunityCommentCreateInput,
): Promise<CommunityComment> {
  return invokeIpc(IpcChannel.CommunityCommentCreate, input)
}

export async function deleteCommunityComment(
  commentId: string,
): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityCommentDelete, { commentId })
}
