import { Alert, Platform } from 'react-native'
import { isLoopbackHostname } from '@toolman/shared'
import type { ModulePanelStatusEntry } from './modulePageStatus'
import {
  MODERATION_SUBTABS,
  USER_CENTER_SECTIONS,
  type ModerationCategoryId,
} from './communitySidebar'

/** Compact Hub labels so the status bar does not clip `http://127.0.0.1:3721` to `http:/`. */
export function formatTriedCommunityHubUrls(urls: string[]): string {
  const labels: string[] = []
  let sawLoopback = false
  for (const raw of urls) {
    try {
      const url = new URL(raw)
      if (isLoopbackHostname(url.hostname)) {
        if (sawLoopback) continue
        sawLoopback = true
        labels.push(`localhost:${url.port || '3721'}`)
        continue
      }
      labels.push(url.host)
    } catch {
      if (raw.trim()) labels.push(raw.trim())
    }
  }
  return labels.join(' · ')
}

export function comingSoon(label: string) {
  const message = `${label}将在后续版本开放；完整发布流程请使用桌面端。`
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(message)
    return
  }
  Alert.alert(label, message)
}

export function notifyLoginRequired() {
  const message = '请先登录或注册后再操作。'
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(message)
    return
  }
  Alert.alert('需要登录', message)
}

export function communityListPageStatus(input: {
  error: string | null
  offline: boolean
  loading: boolean
  itemCount: number
  hubBaseUrl: string
  triedHubUrls: string[]
  hostedWeb?: boolean
}): ModulePanelStatusEntry {
  if (input.error) return { tone: 'error', message: input.error }
  if (input.offline) {
    return {
      tone: 'warning',
      message: input.hostedWeb
        ? '无法连接本机社区目录。请点击页面允许访问本地网络（连接已启动的桌面端），或在社区设置填写电脑的可达地址。'
        : '无法连接社区 Hub。请确认桌面端已启动，或在社区设置填写电脑局域网地址。',
      meta:
        formatTriedCommunityHubUrls(input.triedHubUrls) ||
        (input.hostedWeb ? undefined : input.hubBaseUrl),
    }
  }
  if (input.loading) return { tone: 'info', message: '加载中…' }
  return { tone: 'muted', message: '就绪', meta: `共 ${input.itemCount} 条` }
}

export function communityMinePageStatus(authed: boolean): ModulePanelStatusEntry {
  return authed
    ? { tone: 'muted', message: '就绪', meta: `共 0 条` }
    : { tone: 'warning', message: '请先登录或注册后查看个人发布、安装与收藏' }
}

export function communityManagementPageStatus(canAccess: boolean): ModulePanelStatusEntry {
  return canAccess
    ? { tone: 'muted', message: '就绪', meta: `共 0 条` }
    : { tone: 'error', message: '需要管理权限' }
}

export function communityUserCenterStats() {
  return USER_CENTER_SECTIONS.map((item) => ({
    id: item.id,
    label: item.label,
    count: 0,
  }))
}

export function communityModerationStats(category: ModerationCategoryId) {
  return MODERATION_SUBTABS[category].map((item) => ({
    id: item.id,
    label: item.label,
    count: 0,
  }))
}
