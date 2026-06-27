export function isCommunityHubRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('rate limit') ||
    normalized.includes('rate_limit') ||
    normalized.includes('429') ||
    normalized.includes('too many requests')
  )
}

export function formatCommunityHubError(message: string): string {
  if (isCommunityHubRateLimitError(message)) {
    return '社区服务请求过于频繁，请稍后再试'
  }
  return message
}
