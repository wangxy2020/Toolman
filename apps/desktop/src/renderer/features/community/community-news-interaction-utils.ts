import type { CommunityNewsArticle } from '@toolman/shared'

interface InteractionResult {
  likeCount?: number
  favoriteCount?: number
  dislikeCount?: number
  liked?: boolean
  disliked?: boolean
  favorited?: boolean
}

export function applyNewsInteractionResult(
  item: CommunityNewsArticle,
  articleId: string,
  result: InteractionResult,
): CommunityNewsArticle {
  if (item.id !== articleId) return item
  return {
    ...item,
    likeCount: result.likeCount ?? item.likeCount,
    favoriteCount: result.favoriteCount ?? item.favoriteCount,
    dislikeCount: result.dislikeCount ?? item.dislikeCount,
    likedByMe: result.liked ?? (result.disliked === true ? false : item.likedByMe),
    dislikedByMe: result.disliked ?? (result.liked === true ? false : item.dislikedByMe),
    favoritedByMe: result.favorited ?? item.favoritedByMe,
  }
}
