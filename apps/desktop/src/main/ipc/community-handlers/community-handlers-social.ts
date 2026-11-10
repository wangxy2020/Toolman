import {
  CommunityBoardMessageDeleteInputSchema,
  IpcChannel,
} from '@toolman/shared'
import {
  createBoardMessage,
  createComment,
  countComments,
  deleteBoardMessage,
  deleteComment,
  dislikeBoardMessage,
  favoriteBoardMessage,
  likeBoardMessage,
  listBoardMessages,
  listComments,
  patchBoardMessage,
} from '../../services/community/community-ipc.facade'
import {
  removeCommunityBoardMessageFromYjs,
  syncCommunityBoardMessageToYjs,
} from '../../services/community/community-yjs-provider'
import { communityHandler } from './community-handlers-utils'
import type { HandlerFn } from './community-handlers-utils'

export const communitySocialHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.CommunityCommentList]: communityHandler((input) => listComments(input)),
  [IpcChannel.CommunityCommentCreate]: communityHandler((input) => createComment(input)),
  [IpcChannel.CommunityCommentDelete]: communityHandler((input) => deleteComment(input)),
  [IpcChannel.CommunityCommentCount]: communityHandler((input) => countComments(input)),

  [IpcChannel.CommunityBoardMessageList]: communityHandler(async (input) => {
    const listed = await listBoardMessages(input)
    for (const item of listed.items) syncCommunityBoardMessageToYjs(item)
    return listed
  }),
  [IpcChannel.CommunityBoardMessageCreate]: communityHandler(async (input) => {
    const message = await createBoardMessage(input)
    syncCommunityBoardMessageToYjs(message)
    return message
  }),
  [IpcChannel.CommunityBoardMessageLike]: communityHandler((input) => likeBoardMessage(input)),
  [IpcChannel.CommunityBoardMessageDislike]: communityHandler((input) => dislikeBoardMessage(input)),
  [IpcChannel.CommunityBoardMessageFavorite]: communityHandler((input) =>
    favoriteBoardMessage(input),
  ),
  [IpcChannel.CommunityBoardMessageDelete]: communityHandler(async (input) => {
    const result = await deleteBoardMessage(input)
    const parsed = CommunityBoardMessageDeleteInputSchema.parse(input)
    removeCommunityBoardMessageFromYjs(parsed.messageId)
    return result
  }),
  [IpcChannel.CommunityBoardMessagePatch]: communityHandler(async (input) => {
    const message = await patchBoardMessage(input)
    syncCommunityBoardMessageToYjs(message)
    return message
  }),
}
