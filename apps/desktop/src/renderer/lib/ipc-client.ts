import type { IpcResult } from '@toolman/shared'
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

/** Best-effort IPC invoke that never throws and always returns an IpcResult envelope. */
export async function safeInvoke(
  channel: IpcChannel,
  input?: unknown,
): Promise<IpcResult<unknown>> {
  try {
    return await window.api.invoke(channel, input)
  } catch (error) {
    console.warn(`[ipc] ${channel} invoke failed:`, error)
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    }
  }
}

/** Fire-and-forget IPC with invoke/result error logging. */
export function fireAndForgetInvoke(channel: IpcChannel, input?: unknown): void {
  void safeInvoke(channel, input).then((result) => {
    if (!result.ok) {
      console.warn(`[ipc] ${channel} returned error:`, result.error.message)
    }
  })
}
