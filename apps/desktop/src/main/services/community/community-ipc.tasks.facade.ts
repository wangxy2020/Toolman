import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  CommunityTaskApplicationAcceptInputSchema,
  CommunityTaskApplicationsListInputSchema,
  CommunityTaskApplicationsListOutputSchema,
  CommunityTaskApplyInputSchema,
  CommunityTaskCreateInputSchema,
  CommunityTaskDeliverInputSchema,
  CommunityTaskDeliverySchema,
  CommunityTaskGetInputSchema,
  CommunityTaskIdInputSchema,
  CommunityTaskDeleteOutputSchema,
  CommunityTaskListInputSchema,
  CommunityTaskListOutputSchema,
  CommunityTaskPatchInputSchema,
  CommunityTaskRejectDeliveryInputSchema,
  CommunityTaskReviewCreateInputSchema,
  CommunityTaskReviewListInputSchema,
  CommunityTaskReviewListOutputSchema,
} from '@toolman/shared'

import { assertPathWithinAllowedRoots } from '../path-sandbox.service'
import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import {
  asItems,
  parseTaskItem,
  requireClient,
  withRefreshedHubClient,
} from './community-ipc.facade-core'

export async function listTasks(input: unknown) {
  const parsed = CommunityTaskListInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    task_type: parsed.taskType,
    status: parsed.status,
    publisher_id: parsed.publisherId,
    q: parsed.q,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/tasks${query}`)
  return CommunityTaskListOutputSchema.parse({
    items: asItems(data).map((item) => parseTaskItem(item)),
  })
}

export async function getTask(input: unknown) {
  const parsed = CommunityTaskGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/tasks/${parsed.id}`)
  return parseTaskItem(data)
}

export async function createTask(input: unknown) {
  const parsed = CommunityTaskCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/tasks', toApiJson(parsed))
  return parseTaskItem(data)
}

export async function patchTask(input: unknown) {
  const parsed = CommunityTaskPatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/tasks/${id}`, toApiJson(patch as Record<string, unknown>))
  return parseTaskItem(data)
}

export async function publishTask(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/publish`)
  return parseTaskItem(data)
}

export async function cancelTask(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/cancel`)
  return parseTaskItem(data)
}

export async function deleteTask(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  await withRefreshedHubClient((client) =>
    client.delete<unknown>(`/api/v1/tasks/${parsed.id}`),
  )
  return CommunityTaskDeleteOutputSchema.parse({ deleted: true })
}

export async function applyTask(input: unknown) {
  const parsed = CommunityTaskApplyInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/apply`,
    toApiJson({ proposal: parsed.proposal, quotedAmount: parsed.quotedAmount }),
  )
  return fromApiJson(data)
}

export async function listTaskApplications(input: unknown) {
  const parsed = CommunityTaskApplicationsListInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown[]>(`/api/v1/tasks/${parsed.taskId}/applications`)
  return CommunityTaskApplicationsListOutputSchema.parse({ items: asItems(data) })
}

export async function acceptTaskApplication(input: unknown) {
  const parsed = CommunityTaskApplicationAcceptInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/applications/${parsed.applicationId}/accept`,
  )
  return parseTaskItem(data)
}

export async function deliverTask(input: unknown) {
  const parsed = CommunityTaskDeliverInputSchema.parse(input)
  const client = requireClient()
  const packagePath = assertPathWithinAllowedRoots(parsed.packagePath)
  const packageBytes = await readFile(packagePath)
  const data = await client.postMultipart<unknown>(`/api/v1/tasks/${parsed.taskId}/deliver`, [
    ...(parsed.notes ? [{ name: 'notes', value: parsed.notes }] : []),
    {
      name: 'package',
      value: packageBytes,
      filename: parsed.originalFilename ?? basename(packagePath),
    },
  ])
  return CommunityTaskDeliverySchema.parse(fromApiJson(data))
}

export async function acceptTaskDelivery(input: unknown) {
  const parsed = CommunityTaskIdInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/tasks/${parsed.id}/accept-delivery`)
  return parseTaskItem(data)
}

export async function rejectTaskDelivery(input: unknown) {
  const parsed = CommunityTaskRejectDeliveryInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/reject-delivery`,
    toApiJson({ reason: parsed.reason }),
  )
  return parseTaskItem(data)
}

export async function createTaskReview(input: unknown) {
  const parsed = CommunityTaskReviewCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/tasks/${parsed.taskId}/reviews`,
    toApiJson({
      rating: parsed.rating,
      body: parsed.body,
      revieweeId: parsed.revieweeId,
    }),
  )
  return fromApiJson(data)
}

export async function listTaskReviews(input: unknown) {
  const parsed = CommunityTaskReviewListInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown[]>(`/api/v1/tasks/${parsed.taskId}/reviews`)
  return CommunityTaskReviewListOutputSchema.parse({ items: asItems(data) })
}
