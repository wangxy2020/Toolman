import {
  IpcChannel,
  getIpcChannelContract,
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
  const contract = getIpcChannelContract(channel)
  const parsedInput = contract ? contract.input.parse(input ?? {}) : input
  const data = unwrap((await window.api.invoke(channel, parsedInput)) as IpcResult<T>)
  if (!contract) return data
  return contract.output.parse(data) as T
}
