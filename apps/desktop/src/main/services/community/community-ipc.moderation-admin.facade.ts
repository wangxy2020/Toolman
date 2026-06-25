import {
  CommunityAdminAppointInputSchema,
  CommunityAdminRevokeInputSchema,
  CommunityModerationLogsListInputSchema,
  CommunityModerationLogsListOutputSchema,
  CommunityModerationUserBanInputSchema,
  CommunityModerationUserUnbanInputSchema,
  CommunityModerationDeviceBanInputSchema,
  CommunityModerationDeviceUnbanInputSchema,
  CommunityModeratorListOutputSchema,
  CommunityModeratorUserSchema,
  CommunityUserSearchInputSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import {
  asItems,
  requireClient,
  withRefreshedHubClient,
} from './community-ipc.facade-core'

export async function banModerationUser(input: unknown) {
  const parsed = CommunityModerationUserBanInputSchema.parse(input)
  await withRefreshedHubClient(async (client) => {
    await client.post<unknown>(
      `/api/v1/moderation/users/${parsed.userId}/ban`,
      toApiJson({
        durationHours: parsed.durationHours,
        reason: parsed.reason,
      }),
    )
  })
  return { banned: true }
}

export async function unbanModerationUser(input: unknown) {
  const parsed = CommunityModerationUserUnbanInputSchema.parse(input)
  await withRefreshedHubClient(async (client) => {
    await client.post<unknown>(`/api/v1/moderation/users/${parsed.userId}/unban`, {})
  })
  return { unbanned: true }
}

export async function banModerationDevice(input: unknown) {
  const parsed = CommunityModerationDeviceBanInputSchema.parse(input)
  await withRefreshedHubClient(async (client) => {
    await client.post<unknown>(
      `/api/v1/moderation/devices/${encodeURIComponent(parsed.deviceId)}/ban`,
      toApiJson({
        userId: parsed.userId,
        deviceName: parsed.deviceName,
        durationHours: parsed.durationHours,
        reason: parsed.reason,
      }),
    )
  })
  return { banned: true }
}

export async function unbanModerationDevice(input: unknown) {
  const parsed = CommunityModerationDeviceUnbanInputSchema.parse(input)
  await withRefreshedHubClient(async (client) => {
    await client.post<unknown>(
      `/api/v1/moderation/devices/${encodeURIComponent(parsed.deviceId)}/unban`,
      {},
    )
  })
  return { unbanned: true }
}

export async function listModerationLogs(input: unknown) {
  const parsed = CommunityModerationLogsListInputSchema.parse(input ?? {})
  return withRefreshedHubClient(async (client) => {
    const query = buildApiQuery({
      limit: parsed.limit,
      offset: parsed.offset,
    })
    const data = await client.get<unknown[]>(`/api/v1/moderation/logs${query}`)
    return CommunityModerationLogsListOutputSchema.parse({ items: asItems(data) })
  })
}

export async function listCommunityAdmins() {
  const client = requireClient()
  const data = await client.get<unknown[]>('/api/v1/users/moderators')
  return CommunityModeratorListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityModeratorUserSchema.parse(fromApiJson(item))),
  })
}

export async function searchCommunityUsers(input: unknown) {
  const parsed = CommunityUserSearchInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    q: parsed.q,
    limit: parsed.limit,
  })
  const data = await client.get<unknown[]>(`/api/v1/users/search${query}`)
  return CommunityModeratorListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityModeratorUserSchema.parse(fromApiJson(item))),
  })
}

export async function appointCommunityAdmin(input: unknown) {
  const parsed = CommunityAdminAppointInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/users/${parsed.userId}/appoint-admin`)
  return CommunityModeratorUserSchema.parse(fromApiJson(data))
}

export async function revokeCommunityAdmin(input: unknown) {
  const parsed = CommunityAdminRevokeInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/users/${parsed.userId}/revoke-admin`)
  return CommunityModeratorUserSchema.parse(fromApiJson(data))
}
