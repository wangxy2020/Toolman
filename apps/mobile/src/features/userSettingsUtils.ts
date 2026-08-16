import { cnPrimaryActionLabel, maskPhone } from '../auth/account-utils'
import type { MobileAuthSession } from '../auth/types'

export type SocialProvider = 'wechat' | 'douyin' | 'google' | 'apple'
export type GuestView = 'login' | 'register' | 'forgot'
export type AccountView = 'main' | 'password' | 'vip' | 'delete' | 'bind_phone' | 'bind_wechat'

export const SOCIAL_ITEMS: Array<{
  id: SocialProvider
  label: string
  enabled: boolean
}> = [
  { id: 'wechat', label: '微信', enabled: false },
  { id: 'douyin', label: '抖音', enabled: false },
  { id: 'google', label: 'Google', enabled: true },
  { id: 'apple', label: 'Apple', enabled: true },
]

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatSkuLabel(sku: MobileAuthSession['subscriptionSku']): string {
  return sku === 'pro' ? '专业版' : '社区版'
}

export function formatAccountLabel(auth: MobileAuthSession): string {
  return auth.accountKind === 'phone' ? auth.phone ?? auth.email : auth.email
}

export function isVipAccount(auth: MobileAuthSession): boolean {
  return auth.communityRole === 'enterprise' || auth.subscriptionSku === 'pro'
}

export function formatProfileRoleLabel(auth: MobileAuthSession): string {
  if (auth.communityRole === 'founder') return '超级管理员'
  if (auth.communityRole === 'admin') return '管理员'
  if (isVipAccount(auth)) return 'VIP'
  return '普通用户'
}

export function formatSyncActionTitle(syncStatus: string, hostedBlocked = false): string {
  if (hostedBlocked) return '托管网页无法同步'
  if (syncStatus === 'idle') return '已同步'
  if (syncStatus === 'syncing') return '同步中'
  if (syncStatus === 'offline') return '离线，点此重试'
  if (syncStatus === 'error') return '同步失败，点此重试'
  return '立即同步'
}

export function formatSyncActionSubtitle(hostedBlocked = false): string {
  if (hostedBlocked) {
    return '浏览器会拦截 HTTPS 页访问电脑上的 HTTP Sync Hub。请用本机预览、真机，或在系统诊断填写 HTTPS 隧道地址。'
  }
  return '打开应用时同步一次，之后约每 3 分钟检查变化；也可点此立即同步'
}

export function formatBindPhoneTitle(phone: string | null | undefined): string {
  if (!phone) return '绑定手机号'
  return `已绑定 ${maskPhone(phone)}`
}

export function guestAuthTitle(view: GuestView): string {
  if (view === 'register') return '注册 Toolman 账户'
  if (view === 'forgot') return '找回密码'
  return '登录 Toolman 账户'
}

export function guestAuthSubtitle(view: GuestView): string {
  if (view === 'register') return '使用手机号或邮箱注册，验证码验证后即可完成。'
  if (view === 'forgot') return '通过注册手机号或邮箱接收验证码，设置新密码。'
  return '加入我们，解锁全部功能，你的电脑将如虎添翼。'
}

export function guestPrimaryLabel(view: GuestView, busy: boolean, account: string): string {
  if (busy) {
    if (view === 'register') return '注册中…'
    if (view === 'forgot') return '提交中…'
    return '登录中…'
  }
  if (view === 'forgot') return '重置密码'
  if (view === 'register') return cnPrimaryActionLabel('register', account)
  return cnPrimaryActionLabel('login', account)
}

export function isGuestFormReady(
  view: GuestView,
  account: string,
  password: string,
  smsCode: string,
  confirmPassword: string,
): boolean {
  return (
    Boolean(account.trim() && password.trim()) &&
    (view === 'login' || Boolean(smsCode.trim() && confirmPassword.trim()))
  )
}

export function isAuthSuccessMessage(message: string | null): boolean {
  return Boolean(
    message &&
      (message.includes('已') ||
        message.includes('请查收') ||
        message.includes('邮件') ||
        message.includes('验证码')),
  )
}

export function formatOtpSentHint(
  channel: string,
  expiresInSeconds: number,
  devHint?: string | null,
): string {
  return (
    devHint ??
    `验证码已发送至${channel === 'email' ? '邮箱' : '手机'}，${Math.max(1, Math.round(expiresInSeconds / 60))} 分钟内有效。`
  )
}

export function formatBindPhoneOtpHint(expiresInSeconds: number, devHint?: string | null): string {
  return (
    devHint ?? `验证码已发送至手机，${Math.max(1, Math.round(expiresInSeconds / 60))} 分钟内有效。`
  )
}
