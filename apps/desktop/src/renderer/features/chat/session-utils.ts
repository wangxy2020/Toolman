export function formatSessionTime(timestamp: number | null): string {
  if (!timestamp) return '暂无消息'

  const date = new Date(timestamp)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) return '昨天'

  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function getSessionDisplayTime(session: {
  lastMessageAt: number | null
  updatedAt: number
}): number {
  return session.lastMessageAt ?? session.updatedAt
}
