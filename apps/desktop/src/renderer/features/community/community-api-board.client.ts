import {
  IpcChannel,
  type CommunityBoardMessage,
  type CommunityBoardMessageCreateInput,
  type CommunityBoardMessageListInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function listCommunityBoardMessages(
  input: CommunityBoardMessageListInput = {},
): Promise<{ items: CommunityBoardMessage[] }> {
  return invokeIpc(IpcChannel.CommunityBoardMessageList, input)
}

export async function createCommunityBoardMessage(
  input: CommunityBoardMessageCreateInput,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageCreate, input)
}

export async function likeCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageLike, { messageId })
}

export async function dislikeCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageDislike, { messageId })
}

export async function favoriteCommunityBoardMessage(
  messageId: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessageFavorite, { messageId })
}

export async function deleteCommunityBoardMessage(
  messageId: string,
): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityBoardMessageDelete, { messageId })
}

export async function patchCommunityBoardMessage(
  messageId: string,
  body: string,
): Promise<CommunityBoardMessage> {
  return invokeIpc(IpcChannel.CommunityBoardMessagePatch, { messageId, body })
}
