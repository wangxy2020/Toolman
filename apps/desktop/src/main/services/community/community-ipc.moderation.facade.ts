import {
  CommunityModerationReportCreateInputSchema,
  CommunityModerationReportListInputSchema,
  CommunityModerationReportListOutputSchema,
  CommunityModerationReportResolveInputSchema,
  CommunityModerationReportSchema,
  CommunityModerationResourceActionInputSchema,
  CommunityModerationResourceActionOutputSchema,
  CommunityModerationScanOutputSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import { invalidateCommunityHubCache } from './community-hub-cache.service'
import {
  asItems,
  withRefreshedHubClient,
} from './community-ipc.facade-core'

export async function createModerationReport(input: unknown) {
  const parsed = CommunityModerationReportCreateInputSchema.parse(input)
  return withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>('/api/v1/moderation/reports', toApiJson(parsed))
    return CommunityModerationReportSchema.parse(fromApiJson(data))
  })
}

export async function listModerationReports(input: unknown) {
  const parsed = CommunityModerationReportListInputSchema.parse(input ?? {})
  return withRefreshedHubClient(async (client) => {
    const query = buildApiQuery({
      status: parsed.status,
      limit: parsed.limit,
      offset: parsed.offset,
    })
    const data = await client.get<unknown[]>(`/api/v1/moderation/reports${query}`)
    return CommunityModerationReportListOutputSchema.parse({ items: asItems(data) })
  })
}

export async function resolveModerationReport(input: unknown) {
  const parsed = CommunityModerationReportResolveInputSchema.parse(input)
  return withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>(
      `/api/v1/moderation/reports/${parsed.reportId}/resolve`,
      toApiJson({ action: parsed.action, note: parsed.note }),
    )
    return CommunityModerationReportSchema.parse(fromApiJson(data))
  })
}

export async function suspendModerationResource(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  const result = await withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>(
      `/api/v1/moderation/resources/${parsed.resourceId}/suspend`,
      toApiJson({ reason: parsed.reason }),
    )
    return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
  })
  invalidateCommunityHubCache('marketplace-resources')
  return result
}

export async function approveModerationResource(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  const result = await withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>(
      `/api/v1/moderation/resources/${parsed.resourceId}/approve`,
      toApiJson({ note: parsed.note }),
    )
    return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
  })
  invalidateCommunityHubCache('marketplace-resources')
  return result
}

export async function approveModerationTask(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  return withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>(
      `/api/v1/moderation/tasks/${parsed.resourceId}/approve`,
      toApiJson({ note: parsed.note }),
    )
    return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
  })
}

export async function rejectModerationTask(input: unknown) {
  const parsed = CommunityModerationResourceActionInputSchema.parse(input)
  const result = await withRefreshedHubClient(async (client) => {
    const data = await client.post<unknown>(
      `/api/v1/moderation/tasks/${parsed.resourceId}/reject`,
      toApiJson({ note: parsed.note }),
    )
    return CommunityModerationResourceActionOutputSchema.parse(fromApiJson(data))
  })
  invalidateCommunityHubCache('marketplace-resources')
  return result
}

export async function scanModerationOnline() {
  return withRefreshedHubClient(async (client) => {
    const data = await client.get<unknown>('/api/v1/moderation/scan')
    return CommunityModerationScanOutputSchema.parse(fromApiJson(data))
  })
}

export async function downloadModerationResourcePackage(resourceId: string): Promise<Buffer> {
  return withRefreshedHubClient((client) =>
    client.downloadBinary(`/api/v1/moderation/resources/${resourceId}/package`),
  )
}
