import type { CommunityResourceType, CommunityTaskType } from './communityHubClient'

export const COMMUNITY_TASK_TYPES: Array<{ id: CommunityTaskType; label: string }> = [
  { id: 'development', label: '开发' },
  { id: 'design', label: '设计' },
  { id: 'translation', label: '翻译' },
  { id: 'tender', label: '招标' },
  { id: 'other', label: '其他' },
]

export const COMMUNITY_RESOURCE_LABEL: Record<CommunityResourceType, string> = {
  knowledge: '知识库',
  mcp: 'MCP',
  skill: 'Skill',
  workflow: '工作流',
}

export function buildMessageBody(title: string, body: string): string {
  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  if (!trimmedTitle) return trimmedBody
  if (!trimmedBody) return trimmedTitle
  return `${trimmedTitle}\n\n${trimmedBody}`
}

export function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function validateMessagePublish(title: string, body: string): string | null {
  if (!buildMessageBody(title, body)) return '请填写留言内容'
  return null
}

export function validateTaskPublish(title: string): string | null {
  if (!title.trim()) return '请填写任务标题'
  return null
}

export function validateResourcePublish(title: string, label: string): string | null {
  if (!title.trim()) return `请填写${label}标题`
  return null
}

export function validateNewsFeedUrl(url: string): string | null {
  if (!url.trim()) return '请填写 Feed URL'
  return null
}

export function deriveNewsSourceTitle(title: string, url: string): string {
  const trimmed = title.trim()
  if (trimmed) return trimmed
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'RSS 订阅'
  }
}
