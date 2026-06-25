import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BillingChannel, BillingOrder, BillingPlan } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import {
  createBillingOrder,
  getBillingOrderStatus,
  listBillingPlans,
  mockPayBillingOrder,
} from './billing-api.client'
import { useAuthSession } from './AuthSessionProvider'
import { formatSkuLabel } from './user-account-utils'

export { formatMembershipPrice } from '../../i18n/billing-labels'

export function useMembershipUpgrade(active: boolean) {
  const { t } = useI18n()
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
  const currentSkuLabel = formatSkuLabel(session, t) ?? t('user.labels.sku.community')

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
        setError(err instanceof Error ? err.message : t('user.membership.errors.loadPlans'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [active, resetState, t])

  useEffect(() => {
    if (!active || !order || order.status !== 'pending' || order.mockMode) return

    const timer = window.setInterval(() => {
      void getBillingOrderStatus(order.orderId)
        .then((next) => {
          setOrder(next)
          if (next.status === 'paid') {
            setMessage(t('user.membership.successPaid'))
            void refresh()
          }
        })
        .catch(() => undefined)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [active, order, refresh, t])

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
      setError(err instanceof Error ? err.message : t('user.membership.errors.createOrder'))
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
      setMessage(t('user.membership.successMockPaid'))
      if (result.sessionRefreshed) {
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('user.membership.errors.mockPay'))
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
