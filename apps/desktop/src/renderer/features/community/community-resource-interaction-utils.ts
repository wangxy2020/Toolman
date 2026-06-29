import type {
  CommunityResourceInteractionOutput,
  CommunityResourceItem,
} from '@toolman/shared'

export function applyResourceInteractionResult(
  item: CommunityResourceItem,
  result: CommunityResourceInteractionOutput,
): CommunityResourceItem {
  return {
    ...item,
    likeCount: result.likeCount,
    dislikeCount: result.dislikeCount,
    favoriteCount: result.favoriteCount,
    likedByMe: result.liked ?? item.likedByMe,
    dislikedByMe:
      result.disliked ?? (result.liked === true ? false : item.dislikedByMe),
    favoritedByMe: result.favorited ?? item.favoritedByMe,
  }
}
