import {
  CommunityCommentCountInputSchema,
  CommunityCommentCountOutputSchema,
  CommunityCommentCreateInputSchema,
  CommunityCommentDeleteInputSchema,
  CommunityCommentListInputSchema,
  CommunityCommentListOutputSchema,
  CommunityCommentSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import { asItems, requireClient } from './community-ipc.facade-core'

export async function listComments(input: unknown) {
  const parsed = CommunityCommentListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    parent_id: parsed.parentId ?? undefined,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/comments${query}`)
  return CommunityCommentListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityCommentSchema.parse(fromApiJson(item))),
  })
}

export async function createComment(input: unknown) {
  const parsed = CommunityCommentCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    '/api/v1/comments',
    toApiJson({
      targetType: parsed.targetType,
      targetId: parsed.targetId,
      body: parsed.body,
      parentId: parsed.parentId ?? null,
    }),
  )
  return CommunityCommentSchema.parse(fromApiJson(data))
}

export async function deleteComment(input: unknown) {
  const parsed = CommunityCommentDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/comments/${parsed.commentId}`)
  return { deleted: true as const }
}

export async function countComments(input: unknown) {
  const parsed = CommunityCommentCountInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    parent_id: parsed.parentId ?? undefined,
  })
  const data = await client.get<unknown>(`/api/v1/comments/count${query}`)
  return CommunityCommentCountOutputSchema.parse(fromApiJson(data))
}
