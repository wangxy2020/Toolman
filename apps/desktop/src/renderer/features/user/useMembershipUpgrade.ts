import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BillingChannel, BillingOrder, BillingPlan } from '@toolman/shared'
import {
  createBillingOrder,
  getBillingOrderStatus,
  listBillingPlans,
  mockPayBillingOrder,
} from './billing-api.client'
import { useAuthSession } from './AuthSessionProvider'
import { formatSkuLabel } from './user-account-utils'

export function formatMembershipPrice(cents: number): string {
  if (cents <= 0) return '免费'
  return `¥${(cents / 100).toFixed(2)}`
}

export function useMembershipUpgrade(active: boolean) {
  const { session, refresh } = useAuthSession()
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [mockMode, setMockMode] = useState(true)
  const [channel, setChannel] = useState<BillingChannel>('alipay')
  const [order, setOrder] = useState<BillingOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const proPlan = useMemo(() => plans.find((plan) => plan.sku === 'pro') ?? null, [plans])
  const currentSkuLabel = formatSkuLabel(session) ?? '社区版'

  const resetState = useCallback(() => {
    setOrder(null)
    setError(null)
    setMessage(null)
    setPaying(false)
  }, [])

  useEffect(() => {
    if (!active) {
      resetState()
      return
    }

    let cancelled = false
    setLoading(true)
    void listBillingPlans()
      .then((data) => {
        if (cancelled) return
        setPlans(data.plans)
        setMockMode(data.mockMode)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '无法加载会员套餐')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [active, resetState])

  useEffect(() => {
    if (!active || !order || order.status !== 'pending' || order.mockMode) return

    const timer = window.setInterval(() => {
      void getBillingOrderStatus(order.orderId)
        .then((next) => {
          setOrder(next)
          if (next.status === 'paid') {
            setMessage('支付成功，会员权益已生效。')
            void refresh()
          }
        })
        .catch(() => undefined)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [active, order, refresh])

  const handleCreateOrder = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createBillingOrder('pro', channel)
      setOrder(created)
      if (created.message) {
        setMessage(created.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建订单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleMockPay = async () => {
    if (!order) return
    setPaying(true)
    setError(null)
    try {
      const result = await mockPayBillingOrder(order.orderId)
      setOrder(result.order)
      setMessage('模拟支付成功，专业版会员已生效。')
      if (result.sessionRefreshed) {
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '模拟支付失败')
    } finally {
      setPaying(false)
    }
  }

  return {
    proPlan,
    currentSkuLabel,
    mockMode,
    channel,
    setChannel,
    order,
    loading,
    paying,
    error,
    message,
    handleCreateOrder,
    handleMockPay,
  }
}
