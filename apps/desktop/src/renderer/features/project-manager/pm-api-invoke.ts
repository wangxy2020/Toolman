import { IpcChannel } from '@toolman/shared'

export async function invoke<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  const result = await window.api.invoke(channel, input)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data as T
}
