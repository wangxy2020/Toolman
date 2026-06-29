import {
  IpcChannel,
  type IpcResult,
} from '@toolman/shared'

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(formatIpcErrorMessage(result.error.message))
  }
  return result.data
}

function formatIpcErrorMessage(message: string): string {
  if (!message.startsWith('[')) return message
  try {
    const issues = JSON.parse(message) as Array<{
      path?: Array<string | number>
      message?: string
    }>
    const first = issues[0]
    if (!first?.message) return message
    const path = first.path?.filter((segment) => typeof segment === 'string').join('.')
    return path ? `${path}: ${first.message}` : first.message
  } catch {
    return message
  }
}

export async function invokeIpc<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  return unwrap((await window.api.invoke(channel, input)) as IpcResult<T>)
}
