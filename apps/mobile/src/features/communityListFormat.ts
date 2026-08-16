/** Align list title / meta / preview with desktop community cards. */

export function formatCommunityDateTime(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatCommunityDate(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatCommunityCount(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  return String(value)
}

export function stripHtmlText(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Prefer paragraph breaks when turning HTML into readable plain text. */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
  return stripHtmlText(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function resolveCommunityItemBody(item: {
  body?: string
  contentHtml?: string
  summary?: string
  description: string
  title: string
}): string {
  if (item.body?.trim()) return item.body.trim()
  if (item.contentHtml?.trim()) {
    const fromHtml = htmlToPlainText(item.contentHtml)
    if (fromHtml) return fromHtml
  }
  if (item.summary?.trim()) return item.summary.trim()
  return item.description.trim() || item.title
}

export function formatNewsPreview(text: string, maxLength = 120): string {
  const normalized = stripHtmlText(text)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

export function formatBoardMessageTitle(body: string, maxLength = 60): string {
  const firstLine = body.split('\n')[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return formatNewsPreview(firstLine || body, maxLength) || '留言'
}

export function joinCommunityMeta(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim() ?? '').filter((part) => part.length > 0).join(' · ')
}

const TASK_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  open: '开放',
  assigned: '已指派',
  in_progress: '进行中',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
  closed: '已关闭',
}

const TASK_TYPE_LABEL: Record<string, string> = {
  development: '开发',
  design: '设计',
  translation: '翻译',
  tender: '招标',
  other: '其他',
}

export function formatTaskStatusLabel(status: string): string {
  return TASK_STATUS_LABEL[status] ?? status
}

export function formatTaskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABEL[taskType] ?? taskType
}

export function formatTaskBudget(amount: number, currency: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return ''
  if (currency === 'CNY' || currency === '¥' || !currency) return `¥${amount}`
  return `${currency} ${amount}`
}

export function sortCommunityItems<T extends { createdAt: number; title: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byTime = b.createdAt - a.createdAt
    if (byTime !== 0) return byTime
    return a.title.localeCompare(b.title, 'zh-CN')
  })
}
