import {
  IpcChannel,
  type IdentityProfile,
  type IdentityUpdateInput,
  type IpcResult,
} from '@toolman/shared'

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data
}

export async function getIdentityProfile(): Promise<IdentityProfile> {
  return unwrap((await window.api.invoke(IpcChannel.IdentityGet)) as IpcResult<IdentityProfile>)
}

export async function updateIdentityProfile(input: IdentityUpdateInput): Promise<IdentityProfile> {
  return unwrap(
    (await window.api.invoke(IpcChannel.IdentityUpdate, input)) as IpcResult<IdentityProfile>,
  )
}
