import {
  CommunityBoardMessageCreateInputSchema,
  CommunityBoardMessageDeleteInputSchema,
  CommunityBoardMessageDeleteOutputSchema,
  CommunityBoardMessageDislikeInputSchema,
  CommunityBoardMessageFavoriteInputSchema,
  CommunityBoardMessageLikeInputSchema,
  CommunityBoardMessageListInputSchema,
  CommunityBoardMessageListOutputSchema,
  CommunityBoardMessagePatchInputSchema,
  CommunityBoardMessageSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import { asItems, fetchWithHubCache, requireClient } from './community-ipc.facade-core'

export async function listBoardMessages(input: unknown) {
  const parsed = CommunityBoardMessageListInputSchema.parse(input ?? {})
  const query = buildApiQuery({
    user_id: parsed.userId,
    parent_id: parsed.parentId ?? undefined,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const cacheKey = `board-messages${query}`
  const data = await fetchWithHubCache(cacheKey, (client) =>
    client.get<unknown[]>(`/api/v1/board/messages${query}`),
  )
  return CommunityBoardMessageListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityBoardMessageSchema.parse(fromApiJson(item))),
  })
}

export async function favoriteBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageFavoriteInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/favorite`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function createBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    '/api/v1/board/messages',
    toApiJson({
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function likeBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageLikeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/like`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function dislikeBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageDislikeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/board/messages/${parsed.messageId}/dislike`)
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}

export async function deleteBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessageDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/board/messages/${parsed.messageId}`)
  return CommunityBoardMessageDeleteOutputSchema.parse({ deleted: true })
}

export async function patchBoardMessage(input: unknown) {
  const parsed = CommunityBoardMessagePatchInputSchema.parse(input)
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/board/messages/${parsed.messageId}`, {
    body: parsed.body,
  })
  return CommunityBoardMessageSchema.parse(fromApiJson(data))
}
