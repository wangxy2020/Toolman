import { toErrorMessage } from '@toolman/shared'
import { CommunityHttpError } from './community-http.types'

export function isCommunityFetchNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  const cause = (error as Error & { cause?: { code?: string } }).cause
  const causeCode = cause?.code?.toLowerCase() ?? ''
  const nodeCode = (error as NodeJS.ErrnoException).code?.toLowerCase() ?? ''
  return (
    nodeCode === 'econnreset' ||
    nodeCode === 'epipe' ||
    nodeCode === 'etimedout' ||
    nodeCode === 'econnrefused' ||
    (error.name === 'TypeError' &&
      (message.includes('fetch failed') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        causeCode.includes('econnrefused') ||
        causeCode.includes('enotfound') ||
        causeCode.includes('etimedout') ||
        causeCode.includes('econnreset')))
  )
}

export function humanizeCommunityFetchError(error: unknown): string {
  if (error instanceof CommunityHttpError) {
    if (
      error.status === 429 ||
      error.code === 'RATE_LIMITED' ||
      error.message.toLowerCase().includes('rate limit')
    ) {
      return '社区服务请求过于频繁，请稍后再试'
    }
    return error.message
  }
  if (isCommunityFetchNetworkError(error)) {
    return '无法连接 Community Hub。双实例测试请先启动用户 A，并确认 Hub 正常运行后重试。'
  }
  return toErrorMessage(error, 'Community 请求失败')
}
