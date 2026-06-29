import {
  CommunityBoardMessageDeleteInputSchema,
  IpcChannel,
} from '@toolman/shared'
import {
  createBoardMessage,
  createComment,
  createNewsComment,
  createNewsSource,
  countComments,
  deleteBoardMessage,
  deleteComment,
  deleteNewsSource,
  dislikeBoardMessage,
  dislikeNewsArticle,
  favoriteBoardMessage,
  favoriteNewsArticle,
  fetchNewsSource,
  getNewsArticle,
  likeBoardMessage,
  likeNewsArticle,
  listBoardMessages,
  listComments,
  listNewsArticles,
  listNewsComments,
  listNewsSources,
  listRecommendedNews,
  patchBoardMessage,
} from '../../services/community/community-ipc.facade'
import {
  removeCommunityBoardMessageFromYjs,
  syncCommunityBoardMessageToYjs,
} from '../../services/community/community-yjs-provider'
import { communityHandler } from './community-handlers-utils'
import type { HandlerFn } from './community-handlers-utils'

export const communitySocialHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.CommunityNewsSourceList]: communityHandler(() => listNewsSources()),
  [IpcChannel.CommunityNewsSourceCreate]: communityHandler((input) => createNewsSource(input)),
  [IpcChannel.CommunityNewsSourceDelete]: communityHandler((input) => deleteNewsSource(input)),
  [IpcChannel.CommunityNewsSourceFetch]: communityHandler((input) => fetchNewsSource(input)),
  [IpcChannel.CommunityNewsList]: communityHandler((input) => listNewsArticles(input)),
  [IpcChannel.CommunityNewsGet]: communityHandler((input) => getNewsArticle(input)),
  [IpcChannel.CommunityNewsRecommended]: communityHandler(() => listRecommendedNews()),
  [IpcChannel.CommunityNewsFavorite]: communityHandler((input) => favoriteNewsArticle(input)),
  [IpcChannel.CommunityNewsLike]: communityHandler((input) => likeNewsArticle(input)),
  [IpcChannel.CommunityNewsDislike]: communityHandler((input) => dislikeNewsArticle(input)),
  [IpcChannel.CommunityNewsCommentList]: communityHandler((input) => listNewsComments(input)),
  [IpcChannel.CommunityNewsCommentCreate]: communityHandler((input) => createNewsComment(input)),

  [IpcChannel.CommunityCommentList]: communityHandler((input) => listComments(input)),
  [IpcChannel.CommunityCommentCreate]: communityHandler((input) => createComment(input)),
  [IpcChannel.CommunityCommentDelete]: communityHandler((input) => deleteComment(input)),
  [IpcChannel.CommunityCommentCount]: communityHandler((input) => countComments(input)),

  [IpcChannel.CommunityBoardMessageList]: communityHandler((input) => listBoardMessages(input)),
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
