import {
  IpcChannel,
  type BoqFormatWorkflowExecuteResponse,
  type IpcAlignmentExecuteResponse,
  type PaymentWorkflowExecuteResponse,
  type ShippingCiWorkflowExecuteResponse,
} from '@toolman/shared'

async function invoke<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  const result = await window.api.invoke(channel, input)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data as T
}

export const epcCommercialApi = {
  executeWorkspaceBoqFormatWorkflow(input: { workspaceRoot: string }) {
    return invoke<BoqFormatWorkflowExecuteResponse>(
      IpcChannel.EpcCommercial_ExecuteWorkspaceBoqFormatWorkflow,
      input,
    )
  },
  executeWorkspaceShippingCiWorkflow(input: { workspaceRoot: string }) {
    return invoke<ShippingCiWorkflowExecuteResponse>(
      IpcChannel.EpcCommercial_ExecuteWorkspaceShippingCiWorkflow,
      input,
    )
  },
  executeWorkspaceIpcWorkflow(input: {
    workspaceRoot: string
    period?: string
    masterPricePath?: string
    ignoreRevisions?: boolean
  }) {
    return invoke<IpcAlignmentExecuteResponse>(
      IpcChannel.EpcCommercial_ExecuteWorkspaceIpcWorkflow,
      input,
    )
  },
  executeWorkspacePaymentWorkflow(input: {
    workspaceRoot: string
    period?: string
    ignoreRevisions?: boolean
  }) {
    return invoke<PaymentWorkflowExecuteResponse>(
      IpcChannel.EpcCommercial_ExecuteWorkspacePaymentWorkflow,
      input,
    )
  },
}
