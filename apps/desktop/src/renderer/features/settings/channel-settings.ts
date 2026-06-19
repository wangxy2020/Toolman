export {
  CHANNEL_PLATFORMS,
  type ChannelPlatformId,
  DEFAULT_CHANNEL_WEBHOOK_PORT,
} from '@toolman/shared'

export type { ImChannelConfigPublic as ChannelConfigPublic } from '@toolman/shared'

const STORAGE_KEY = 'toolman:channel-configs'

/** @deprecated 仅用于一次性迁移到主进程存储 */
export interface LegacyChannelConfig {
  id: string
  platform: import('@toolman/shared').ChannelPlatformId
  enabled: boolean
  name: string
  assistantId: string
  appId: string
  appSecret: string
  encryptKey: string
  verificationToken: string
  domain: string
  allowedChatIds: string
}

export function loadLegacyChannelConfigs(): LegacyChannelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LegacyChannelConfig[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function clearLegacyChannelConfigs(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function channelStatusLabel(status: string): string {
  switch (status) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中'
    case 'error':
      return '错误'
    case 'unsupported':
      return '即将推出'
    default:
      return '未连接'
  }
}
