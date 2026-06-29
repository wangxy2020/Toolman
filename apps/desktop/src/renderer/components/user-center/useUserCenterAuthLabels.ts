import type { AuthRegion } from '@toolman/shared'

import type { TranslateFn } from '../../i18n/useI18n'
import type { ViewMode } from './types'

export function isCnEmailAccountInput(value: string): boolean {
  return value.trim().includes('@')
}

export function cnPrimaryActionLabel(view: ViewMode, account: string, t?: TranslateFn): string {
  if (view === 'register') {
    return isCnEmailAccountInput(account)
      ? (t?.('user.auth.registerEmail') ?? '邮箱注册')
      : (t?.('user.auth.registerPhone') ?? '手机号注册')
  }
  return isCnEmailAccountInput(account)
    ? (t?.('user.auth.loginEmail') ?? '邮箱登录')
    : (t?.('user.auth.loginPhone') ?? '手机号登录')
}

export function viewTitle(view: ViewMode, t?: TranslateFn): string {
  switch (view) {
    case 'register':
      return t?.('user.auth.titleRegister') ?? '注册 Toolman 账户'
    case 'forgot_password':
      return t?.('user.auth.titleForgotPassword') ?? '找回密码'
    case 'profile':
      return t?.('user.auth.titleProfile') ?? '账户中心'
    default:
      return t?.('user.auth.titleLogin') ?? '登录 Toolman 账户'
  }
}

export function viewSubtitle(view: ViewMode, t?: TranslateFn, region: AuthRegion = 'cn'): string {
  switch (view) {
    case 'register':
      return t?.('user.auth.subtitleRegister') ?? '使用手机号或邮箱注册，验证码验证后即可完成。'
    case 'forgot_password':
      return region === 'intl'
        ? (t?.('user.auth.subtitleForgotPasswordIntl') ?? '输入注册邮箱，我们将发送密码重置链接。')
        : (t?.('user.auth.subtitleForgotPasswordCn') ?? '通过注册手机号或邮箱接收验证码，设置新密码。')
    case 'profile':
      return t?.('user.auth.subtitleProfile') ?? '管理个人资料、安全绑定与账户设置。'
    default:
      return t?.('user.auth.subtitleLogin') ?? '加入我们，解锁全部功能，你的电脑将如虎添翼。'
  }
}
