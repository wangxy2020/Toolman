export const CHANNEL_PLATFORM_IDS = [
  'feishu',
  'dingtalk',
  'wechat',
  'qq',
  'discord',
  'slack',
] as const

export type ChannelPlatformId = (typeof CHANNEL_PLATFORM_IDS)[number]

export const CHANNEL_PLATFORMS: {
  id: ChannelPlatformId
  name: string
  defaultDomain?: string
}[] = [
  { id: 'feishu', name: '飞书', defaultDomain: '飞书（中国）' },
  { id: 'dingtalk', name: '钉钉' },
  { id: 'wechat', name: '微信' },
  { id: 'qq', name: 'QQ' },
  { id: 'discord', name: 'Discord' },
  { id: 'slack', name: 'Slack' },
]

export const DEFAULT_CHANNEL_WEBHOOK_PORT = 18765
