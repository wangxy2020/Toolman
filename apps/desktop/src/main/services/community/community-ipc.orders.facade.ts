import {
  CommunityOrderCreateInputSchema,
  CommunityOrderGetInputSchema,
  CommunityOrderItemSchema,
  CommunityOrderUpdateStatusInputSchema,
} from '@toolman/shared'

import { fromApiJson, toApiJson } from './community-case'
import { requireClient } from './community-ipc.facade-core'

export async function createOrder(input: unknown) {
  const parsed = CommunityOrderCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/orders', toApiJson(parsed))
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}

export async function getOrder(input: unknown) {
  const parsed = CommunityOrderGetInputSchema.parse(input)
  const client = requireClient()
  const data = await client.get<unknown>(`/api/v1/orders/${parsed.id}`)
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}

export async function updateOrderStatus(input: unknown) {
  const parsed = CommunityOrderUpdateStatusInputSchema.parse(input)
  const client = requireClient()
  const data = await client.patch<unknown>(
    `/api/v1/orders/${parsed.id}/status`,
    toApiJson({ status: parsed.status }),
  )
  return CommunityOrderItemSchema.parse(fromApiJson(data))
}
