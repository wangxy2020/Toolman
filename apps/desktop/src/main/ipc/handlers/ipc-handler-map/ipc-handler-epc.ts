import { IpcChannel, ipcOk } from '@toolman/shared'
import { epcCommercialService } from '../../../services/epc-commercial/EpcCommercialService'
import type { HandlerFn } from './types'

export const epcIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.EpcCommercial_GetMachineId]: async () =>
    ipcOk({ machineId: await epcCommercialService.getMachineId() }),

  [IpcChannel.EpcCommercial_GetLicenseStatus]: async () =>
    ipcOk(await epcCommercialService.getLicenseStatus()),

  [IpcChannel.EpcCommercial_ExecuteWorkspaceIpcWorkflow]: async (input) =>
    ipcOk(await epcCommercialService.executeWorkspaceIpcWorkflow(input as never)),

  [IpcChannel.EpcCommercial_ExecuteIpcAlignment]: async (input) =>
    ipcOk(await epcCommercialService.executeIpcAlignment(input as never)),

  [IpcChannel.EpcCommercial_ExecuteWorkspaceBoqFormatWorkflow]: async (input) =>
    ipcOk(await epcCommercialService.executeWorkspaceBoqFormatWorkflow(input as never)),

  [IpcChannel.EpcCommercial_ExecuteWorkspaceShippingCiWorkflow]: async (input) =>
    ipcOk(await epcCommercialService.executeWorkspaceShippingCiWorkflow(input as never)),

  [IpcChannel.EpcCommercial_ExecuteWorkspacePaymentWorkflow]: async (input) =>
    ipcOk(await epcCommercialService.executeWorkspacePaymentWorkflow(input as never)),

  [IpcChannel.EpcCommercial_ExportErrorAudit]: async (input) =>
    ipcOk(await epcCommercialService.exportErrorAudit(input as never)),

  [IpcChannel.EpcCommercial_ReadWorkflowLog]: async (input) =>
    ipcOk(await epcCommercialService.readWorkflowLog(input as never)),

  [IpcChannel.EpcCommercial_AppendWorkflowLog]: async (input) => {
    await epcCommercialService.appendWorkflowLog(input as never)
    return ipcOk({ ok: true })
  },

  [IpcChannel.EpcCommercial_AppendPaymentDataPatch]: async (input) =>
    ipcOk(await epcCommercialService.appendPaymentDataPatch(input as never)),

  [IpcChannel.EpcCommercial_ApplyPaymentDataOverrides]: async (input) => {
    const workspaceRoot =
      typeof input === 'object' && input && 'workspaceRoot' in input
        ? String((input as { workspaceRoot: unknown }).workspaceRoot)
        : ''
    return ipcOk(await epcCommercialService.applyPaymentDataOverrides(workspaceRoot))
  },
}
