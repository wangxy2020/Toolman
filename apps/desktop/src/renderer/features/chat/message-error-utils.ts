import type { IpcError } from '@toolman/shared'

type ErrorDetails = {
  name?: string
  stack?: string
}

export function getErrorTitle(error: IpcError): string {
  switch (error.code) {
    case 'ABORTED':
      return '请求被中止导致中止错误。'
    case 'PROVIDER_ERROR':
      return '模型服务请求失败。'
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。'
    case 'VALIDATION_ERROR':
      return '请求参数无效。'
    default:
      return '处理请求时发生错误。'
  }
}

export function getErrorName(error: IpcError): string {
  const details = error.details as ErrorDetails | undefined
  if (details?.name) return details.name
  return error.code
}

export function getErrorStack(error: IpcError): string {
  const details = error.details as ErrorDetails | undefined
  if (details?.stack?.trim()) return details.stack
  if (error.details != null) {
    return JSON.stringify(error.details, null, 2)
  }
  return ''
}

export function formatErrorForCopy(error: IpcError): string {
  const parts = [
    `错误名称: ${getErrorName(error)}`,
    `错误信息: ${error.message}`,
  ]
  const stack = getErrorStack(error)
  if (stack) parts.push(`堆栈信息:\n${stack}`)
  return parts.join('\n\n')
}

export function hasMessageError(status: string): boolean {
  return status === 'failed' || status === 'aborted'
}
