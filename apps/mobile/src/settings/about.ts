export const TOOLMAN_GITHUB_URL = 'https://github.com/wangxy2020/Toolman'

const TOOLMAN_LICENSE_URL = `${TOOLMAN_GITHUB_URL}/blob/main/LICENSE`
export const TOOLMAN_THIRD_PARTY_NOTICES_URL = `${TOOLMAN_GITHUB_URL}/blob/main/THIRD_PARTY_NOTICES.md`

export const TOOLMAN_JOIN_US_QQ_GROUP = '1054710968'
export const TOOLMAN_JOIN_US_QQ = '31897124'

export const ABOUT_EXTERNAL_LINK_URLS = {
  docs: `${TOOLMAN_GITHUB_URL}#readme`,
  changelog: `${TOOLMAN_GITHUB_URL}/blob/main/docs/engineering/RELEASE_STATUS.md`,
  website: TOOLMAN_GITHUB_URL,
  license: TOOLMAN_LICENSE_URL,
  thirdParty: TOOLMAN_THIRD_PARTY_NOTICES_URL,
} as const

export const ABOUT_LINK_IDS = [
  'docs',
  'changelog',
  'website',
  'license',
  'thirdParty',
  'feedback',
  'enterprise',
  'email',
  'join',
] as const

export type AboutLinkId = (typeof ABOUT_LINK_IDS)[number]

export const ABOUT_LINK_LABELS: Record<AboutLinkId, string> = {
  docs: '帮助文档',
  changelog: '更新日志',
  website: '官方网站',
  license: '开源许可证',
  thirdParty: '第三方组件声明',
  feedback: '意见反馈',
  enterprise: '企业版',
  email: '邮件联系',
  join: '加入我们',
}

export const ABOUT_LINK_ACTIONS: Record<AboutLinkId, string> = {
  docs: '查看',
  changelog: '查看',
  website: '查看',
  license: '查看',
  thirdParty: '查看',
  feedback: '反馈',
  enterprise: '查看',
  email: '邮件',
  join: '查看',
}

export function resolveAboutLinkUrl(id: AboutLinkId): string | undefined {
  if (id in ABOUT_EXTERNAL_LINK_URLS) {
    return ABOUT_EXTERNAL_LINK_URLS[id as keyof typeof ABOUT_EXTERNAL_LINK_URLS]
  }
  return undefined
}
