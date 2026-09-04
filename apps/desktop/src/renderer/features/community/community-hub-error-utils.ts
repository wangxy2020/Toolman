export function isCommunityHubRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('rate limit') ||
    normalized.includes('rate_limit') ||
    normalized.includes('429') ||
    normalized.includes('too many requests')
  )
}

export function isCommunityHubAuthError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('missing authorization bearer token') ||
    normalized.includes('invalid hub token') ||
    normalized.includes('community hub jwt secret not configured')
  )
}

export function formatCommunityHubError(message: string): string {
  if (isCommunityHubRateLimitError(message)) {
    return '社区服务请求过于频繁，请稍后再试'
  }
  if (isCommunityHubAuthError(message)) {
    return '社区身份未就绪，请刷新后重试。若仍失败，请重启桌面端'
  }
  return message
}
