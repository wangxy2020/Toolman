import { IpcChannel, type BillingChannel, type BillingOrder, type BillingPlan } from '@toolman/shared'

export async function listBillingPlans() {
  const result = await window.api.invoke(IpcChannel.BillingListPlans)
  if (!result.ok) throw new Error(result.error.message)
  return result.data as { plans: BillingPlan[]; mockMode: boolean; apiConfigured: boolean }
}

export async function createBillingOrder(sku: 'pro', channel: BillingChannel) {
  const result = await window.api.invoke(IpcChannel.BillingCreateOrder, { sku, channel })
  if (!result.ok) throw new Error(result.error.message)
  return result.data as BillingOrder
}

export async function getBillingOrderStatus(orderId: string) {
  const result = await window.api.invoke(IpcChannel.BillingGetOrderStatus, { orderId })
  if (!result.ok) throw new Error(result.error.message)
  return result.data as BillingOrder
}

export async function mockPayBillingOrder(orderId: string) {
  const result = await window.api.invoke(IpcChannel.BillingMockPay, { orderId })
  if (!result.ok) throw new Error(result.error.message)
  return result.data as { order: BillingOrder; sessionRefreshed: boolean }
}
