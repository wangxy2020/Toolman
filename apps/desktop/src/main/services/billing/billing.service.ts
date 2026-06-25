import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { eq } from 'drizzle-orm'
import { identities } from '@toolman/db'
import {
  GROUP_MAX_MEMBERS_COMMUNITY,
  BillingCreateOrderInputSchema,
  BillingGetOrderStatusInputSchema,
  BillingMockPayInputSchema,
  type BillingListPlansOutput,
  type BillingOrder,
  type BillingPlan,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getAuthSession } from '../auth-session.service'
import {
  getProGroupMaxMembers,
  getProMembershipEntitlements,
} from '../auth/entitlement.service'
import { invalidateHubTokenCache } from '../community/community-hub-auth.service'
import { refreshOwnedWorkspaceVipPools } from '../p2p/p2p-workspace-vip-pool.service'

const PRO_PRICE_CENTS = 1900
const ORDER_TTL_MS = 15 * 60 * 1000

const orders = new Map<string, BillingOrder & { createdAt: number }>()

function isBillingApiConfigured(): boolean {
  const url = process.env.TOOLMAN_BILLING_API_URL?.trim()
  return Boolean(url)
}

function isBillingMockEnabled(): boolean {
  if (app.isPackaged) return false
  if (process.env.TOOLMAN_BILLING_MOCK === '0') return false
  if (process.env.TOOLMAN_BILLING_MOCK === '1') return true
  return !isBillingApiConfigured()
}

function buildPlans(): BillingPlan[] {
  return [
    {
      sku: 'community',
      name: '社区版',
      description: '基础协作能力，群组最多 10 人。',
      priceCents: 0,
      groupMaxMembers: GROUP_MAX_MEMBERS_COMMUNITY,
      billingPeriodLabel: '免费',
    },
    {
      sku: 'pro',
      name: '专业版（每人/设备）',
      description: `提升群组成员上限至 ${getProGroupMaxMembers()} 人，并解锁后续高级协作能力。`,
      priceCents: PRO_PRICE_CENTS,
      groupMaxMembers: getProGroupMaxMembers(),
      billingPeriodLabel: '月',
    },
  ]
}

function placeholderQrMessage(channel: 'alipay' | 'wechat'): string {
  return channel === 'alipay'
    ? '支付宝扫码支付通道配置中，请稍后在会员中心重试。'
    : '微信扫码支付通道配置中，请稍后在会员中心重试。'
}

function createPlaceholderOrder(
  sku: 'pro',
  channel: 'alipay' | 'wechat',
): BillingOrder & { createdAt: number } {
  const mockMode = isBillingMockEnabled()
  const order: BillingOrder & { createdAt: number } = {
    orderId: randomUUID(),
    sku,
    channel,
    amountCents: PRO_PRICE_CENTS,
    status: 'pending',
    qrUrl: null,
    qrImageDataUrl: null,
    mockMode,
    message: mockMode
      ? '当前为开发占位模式：可点击下方「模拟支付成功」完成会员升级验证。'
      : placeholderQrMessage(channel),
    paidAt: null,
    createdAt: Date.now(),
  }
  orders.set(order.orderId, order)
  return order
}

function getOrderOrThrow(orderId: string): BillingOrder & { createdAt: number } {
  const order = orders.get(orderId)
  if (!order) {
    throw new Error('订单不存在或已过期')
  }
  if (order.status === 'pending' && Date.now() - order.createdAt > ORDER_TTL_MS) {
    order.status = 'expired'
    orders.set(orderId, order)
  }
  return order
}

function applyProMembership(): void {
  const session = getAuthSession()
  const db = getDatabase()
  const now = new Date()

  db.update(identities)
    .set({
      subscriptionSku: 'pro',
      entitlementsJson: JSON.stringify(getProMembershipEntitlements()),
      updatedAt: now,
    })
    .where(eq(identities.id, session.identityId))
    .run()

  invalidateHubTokenCache()
  refreshOwnedWorkspaceVipPools()
}

export function listBillingPlans(): BillingListPlansOutput {
  return {
    plans: buildPlans(),
    mockMode: isBillingMockEnabled(),
    apiConfigured: isBillingApiConfigured(),
  }
}

export function createBillingOrder(input: unknown): BillingOrder {
  const parsed = BillingCreateOrderInputSchema.parse(input)
  if (parsed.sku !== 'pro') {
    throw new Error('当前仅支持升级至专业版')
  }

  if (isBillingApiConfigured()) {
    throw new Error('云端 Billing API 尚未接入，请使用开发占位模式验证流程')
  }

  return createPlaceholderOrder(parsed.sku, parsed.channel)
}

export function getBillingOrderStatus(input: unknown): BillingOrder {
  const parsed = BillingGetOrderStatusInputSchema.parse(input)
  return getOrderOrThrow(parsed.orderId)
}

export function mockPayBillingOrder(input: unknown): { order: BillingOrder; sessionRefreshed: boolean } {
  if (!isBillingMockEnabled()) {
    throw new Error('模拟支付仅在占位模式下可用')
  }

  const parsed = BillingMockPayInputSchema.parse(input)
  const order = getOrderOrThrow(parsed.orderId)
  if (order.status === 'paid') {
    return { order, sessionRefreshed: false }
  }
  if (order.status === 'expired') {
    throw new Error('订单已过期，请重新创建')
  }

  order.status = 'paid'
  order.paidAt = Date.now()
  order.message = '模拟支付成功，会员权益已生效。'
  orders.set(order.orderId, order)
  applyProMembership()

  return { order, sessionRefreshed: true }
}
