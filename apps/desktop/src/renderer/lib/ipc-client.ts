import {
  IpcChannel,
  IPC_CHANNEL_CONTRACT,
  type IpcContractChannel,
  type IpcContractInput,
  type IpcContractOutput,
} from '@toolman/shared'

export class IpcInvokeError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'IpcInvokeError'
  }
}

/** Typed IPC invoke with Zod-validated output for contract channels. */
export async function invokeIpc<C extends IpcContractChannel>(
  channel: C,
  input: IpcContractInput<C>,
): Promise<IpcContractOutput<C>> {
  const contract = IPC_CHANNEL_CONTRACT[channel]
  contract.input.parse(input)
  const result = await window.api.invoke(channel as IpcChannel, input)
  if (!result.ok) {
    throw new IpcInvokeError(result.error.message, result.error.code)
  }
  return contract.output.parse(result.data) as IpcContractOutput<C>
}
