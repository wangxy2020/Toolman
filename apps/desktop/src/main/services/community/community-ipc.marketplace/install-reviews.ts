import {
  CommunityInstallCompleteInputSchema,
  CommunityInstallCompleteOutputSchema,
  CommunityInstallHistoryInputSchema,
  CommunityInstallHistoryOutputSchema,
  CommunityInstallInputSchema,
  CommunityInstallOutputSchema,
  CommunityInstallRollbackInputSchema,
  CommunityReviewCreateInputSchema,
  CommunityReviewDeleteInputSchema,
  CommunityReviewDeleteOutputSchema,
  CommunityReviewItemSchema,
  CommunityReviewListInputSchema,
  CommunityReviewListOutputSchema,
  CommunityReviewPatchInputSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from '../community-case'
import { asItems, requireClient } from '../community-ipc.facade-core'

export async function startInstall(input: unknown) {
  const parsed = CommunityInstallInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.resourceType}/${parsed.resourceId}`,
    toApiJson({
      version: parsed.version,
      workspaceId: parsed.workspaceId,
      options: parsed.options,
    }),
  )
  return CommunityInstallOutputSchema.parse(fromApiJson(data))
}

export async function completeInstall(input: unknown) {
  const parsed = CommunityInstallCompleteInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.installId}/complete`,
    toApiJson({
      status: parsed.status,
      localRef: parsed.localRef,
      errorMessage: parsed.errorMessage,
    }),
  )
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function rollbackInstall(input: unknown) {
  const parsed = CommunityInstallRollbackInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/install/${parsed.installId}/rollback`)
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function listInstallHistory(input: unknown) {
  const parsed = CommunityInstallHistoryInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    resource_type: parsed.resourceType,
    workspace_id: parsed.workspaceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/install/history${query}`)
  return CommunityInstallHistoryOutputSchema.parse({ items: asItems(data) })
}

export async function createReview(input: unknown) {
  const parsed = CommunityReviewCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/reviews', toApiJson(parsed))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function listReviews(input: unknown) {
  const parsed = CommunityReviewListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    resource_id: parsed.resourceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/reviews${query}`)
  return CommunityReviewListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityReviewItemSchema.parse(item)),
  })
}

export async function patchReview(input: unknown) {
  const parsed = CommunityReviewPatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/reviews/${id}`, toApiJson(patch as Record<string, unknown>))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function deleteReview(input: unknown) {
  const parsed = CommunityReviewDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/reviews/${parsed.id}`)
  return CommunityReviewDeleteOutputSchema.parse({ deleted: true })
}
