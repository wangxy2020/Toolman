import type { BillingPlan } from '@toolman/shared'

import type { AppLanguage } from '../features/settings/app-settings'
import type { TranslateFn } from './I18nProvider'

export function formatMembershipPrice(
  cents: number,
  language: AppLanguage,
  t: TranslateFn,
): string {
  if (cents <= 0) return t('user.membership.free')
  const symbol = language === 'en' ? '$' : '¥'
  return `${symbol}${(cents / 100).toFixed(2)}`
}

export function translateBillingPlanName(plan: BillingPlan, t: TranslateFn): string {
  if (plan.sku === 'pro') return t('user.membership.planProPerDevice')
  if (plan.sku === 'community') return t('user.labels.sku.community')
  return plan.name
}

export function translateBillingPlanDescription(plan: BillingPlan, t: TranslateFn): string {
  if (plan.sku === 'pro') {
    return t('user.membership.planProDescription', { count: plan.groupMaxMembers })
  }
  return plan.description
}

export function translateBillingPeriodLabel(label: string, t: TranslateFn): string {
  if (label === '月' || label.toLowerCase() === 'month') return t('user.membership.periodMonth')
  if (label === '免费' || label.toLowerCase() === 'free') return t('user.membership.free')
  return label
}
