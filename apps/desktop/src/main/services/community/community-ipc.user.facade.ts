import {
  CommunityUserMeUpdateInputSchema,
  CommunityUserProfileSchema,
} from '@toolman/shared'

import { fromApiJson, toApiJson } from './community-case'
import { requireClient } from './community-ipc.facade-core'

export async function getUserMe() {
  const client = requireClient()
  const data = await client.get<unknown>('/api/v1/users/me')
  return CommunityUserProfileSchema.parse(fromApiJson(data))
}

export async function updateUserMe(input: unknown) {
  const parsed = CommunityUserMeUpdateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.patch<unknown>('/api/v1/users/me', toApiJson(parsed))
  return CommunityUserProfileSchema.parse(fromApiJson(data))
}

export async function touchCommunityPresenceHeartbeat() {
  const { touchCommunityPresence } = await import('./community-presence.service')
  await touchCommunityPresence()
  return { ok: true }
}
