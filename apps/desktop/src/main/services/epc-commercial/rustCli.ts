import { loggerService } from './epc-logger.js'
import { invokeCli } from './rustCliCore.js'
import type {
  EpcPaymentDataPatchParams,
  EpcSimpleOkResponse,
  ExportErrorAuditParams,
  ExportErrorAuditResponse,
  IpcAlignmentExecuteResponse,
  BoqFormatWorkflowExecuteResponse,
  PaymentWorkflowExecuteResponse,
  ShippingCiWorkflowExecuteResponse,
} from '@toolman/shared'

const logger = loggerService.withContext('EpcCommercialRustCli')

export { isRustEngineAvailable, resolveCliPath } from './rustCliCore.js'

export const rustGetMachineId = async (): Promise<{ machineId: string }> => {
  return invokeCli({ command: 'get-machine-id' })
}

export interface RustIpcAlignmentRequest {
  masterPricePath: string
  ipcRootPath: string
  period: string
  dataDir: string
}

export interface RustWorkspaceIpcWorkflowRequest {
  workspaceRoot: string
  period?: string
  masterPricePath?: string
  dataDir: string
  ignoreRevisions?: boolean
}

export interface RustWorkspaceBoqFormatWorkflowRequest {
  workspaceRoot: string
  dataDir: string
}

export interface RustWorkspacePaymentWorkflowRequest {
  workspaceRoot: string
  period?: string
  dataDir: string
  ignoreRevisions?: boolean
}

export interface RustWorkspaceShippingCiWorkflowRequest {
  workspaceRoot: string
  dataDir: string
  deferLedgerSuccess?: boolean
}

export interface RustCommitShippingCiLedgerRequest {
  workspaceRoot: string
  dataDir: string
  successes: Array<{ fileName: string; md5: string }>
}

export const rustExecuteIpcAlignment = async (
  request: RustIpcAlignmentRequest,
): Promise<IpcAlignmentExecuteResponse> => {
  return rustExecuteWorkspaceIpcWorkflow({
    workspaceRoot: request.ipcRootPath,
    period: request.period,
    masterPricePath: request.masterPricePath,
    dataDir: request.dataDir,
  })
}

const mapErrorCode = (code?: string): IpcAlignmentExecuteResponse['errorCode'] => {
  if (code === 'AUTH_EXPIRED') return 'AUTH_EXPIRED'
  if (code === 'INVALID_ARGS') return 'INVALID_ARGS'
  if (code === 'INTERNAL_ERROR') return 'INTERNAL_ERROR'
  if (code === 'FILE_LOCKED') return 'FILE_LOCKED'
  return undefined
}

const isUnknownWorkspaceIpcCommand = (message?: string): boolean =>
  Boolean(
    message?.includes('unknown variant') &&
      (message?.includes('execute-workspace-ipc-workflow') ||
        message?.includes('execute-workspace-boq-workflow')),
  )

const isUnknownWorkspaceBoqFormatCommand = (message?: string): boolean =>
  Boolean(message?.includes('unknown variant') && message?.includes('execute-workspace-boq-format-workflow'))

const isUnknownWorkspacePaymentCommand = (message?: string): boolean =>
  Boolean(message?.includes('unknown variant') && message?.includes('execute-workspace-payment-workflow'))

const mapWorkspaceIpcCliResponse = (raw: {
  ok: boolean
  report?: IpcAlignmentExecuteResponse['report']
  errorCode?: string
  errorMessage?: string
}): IpcAlignmentExecuteResponse => ({
  ok: raw.ok,
  report: raw.report,
  errorCode: mapErrorCode(raw.errorCode),
  errorMessage: raw.errorMessage,
})

export const rustExecuteWorkspaceIpcWorkflow = async (
  request: RustWorkspaceIpcWorkflowRequest,
): Promise<IpcAlignmentExecuteResponse> => {
  const workspaceRequest = {
    workspaceRoot: request.workspaceRoot,
    period: request.period ?? null,
    masterPricePath: request.masterPricePath ?? null,
    dataDir: request.dataDir,
    ignoreRevisions: request.ignoreRevisions ?? null,
  }

  const raw = await invokeCli<{
    ok: boolean
    report?: IpcAlignmentExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-workspace-ipc-workflow',
    request: workspaceRequest,
  })

  if (raw.ok || !isUnknownWorkspaceIpcCommand(raw.errorMessage)) {
    return mapWorkspaceIpcCliResponse(raw)
  }

  logger.warn('Rust CLI missing execute-workspace-ipc-workflow; falling back to execute-ipc-alignment', {
    errorMessage: raw.errorMessage,
  })

  const legacy = await invokeCli<{
    ok: boolean
    report?: IpcAlignmentExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-ipc-alignment',
    request: {
      masterPricePath: request.masterPricePath ?? '',
      ipcRootPath: request.workspaceRoot,
      period: request.period ?? '',
      dataDir: request.dataDir,
    },
  })

  return mapWorkspaceIpcCliResponse(legacy)
}

const mapWorkspaceBoqFormatCliResponse = (raw: {
  ok: boolean
  report?: BoqFormatWorkflowExecuteResponse['report']
  errorCode?: string
  errorMessage?: string
}): BoqFormatWorkflowExecuteResponse => {
  const unsupportedMessage =
    '引擎不支持 execute-workspace-boq-format-workflow 命令，请在项目根目录执行: pnpm epc:build'
  return {
    ok: raw.ok,
    report: raw.report,
    errorCode: mapErrorCode(raw.errorCode),
    errorMessage: isUnknownWorkspaceBoqFormatCommand(raw.errorMessage) ? unsupportedMessage : raw.errorMessage,
  }
}

export const rustExecuteWorkspaceBoqFormatWorkflow = async (
  request: RustWorkspaceBoqFormatWorkflowRequest,
): Promise<BoqFormatWorkflowExecuteResponse> => {
  const raw = await invokeCli<{
    ok: boolean
    report?: BoqFormatWorkflowExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-workspace-boq-format-workflow',
    request: {
      workspaceRoot: request.workspaceRoot,
      dataDir: request.dataDir,
    },
  })
  return mapWorkspaceBoqFormatCliResponse(raw)
}

const mapWorkspacePaymentCliResponse = (raw: {
  ok: boolean
  report?: PaymentWorkflowExecuteResponse['report']
  errorCode?: string
  errorMessage?: string
}): PaymentWorkflowExecuteResponse => {
  const unsupportedMessage =
    '引擎不支持 execute-workspace-payment-workflow 命令，可用命令列表：get-machine-id, sign-license, execute-ipc-alignment, execute-workspace-ipc-workflow, execute-workspace-boq-format-workflow, export-error-audit'
  return {
    ok: raw.ok,
    report: raw.report,
    errorCode: mapErrorCode(raw.errorCode),
    errorMessage: isUnknownWorkspacePaymentCommand(raw.errorMessage) ? unsupportedMessage : raw.errorMessage,
  }
}

export const rustExecuteWorkspacePaymentWorkflow = async (
  request: RustWorkspacePaymentWorkflowRequest,
): Promise<PaymentWorkflowExecuteResponse> => {
  const raw = await invokeCli<{
    ok: boolean
    report?: PaymentWorkflowExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-workspace-payment-workflow',
    request: {
      workspaceRoot: request.workspaceRoot,
      period: request.period ?? null,
      dataDir: request.dataDir,
      ignoreRevisions: request.ignoreRevisions ?? null,
    },
  })
  return mapWorkspacePaymentCliResponse(raw)
}

export const rustExecuteWorkspaceShippingCiWorkflow = async (
  request: RustWorkspaceShippingCiWorkflowRequest,
): Promise<ShippingCiWorkflowExecuteResponse> => {
  const raw = await invokeCli<{
    ok: boolean
    report?: ShippingCiWorkflowExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-workspace-shipping-ci-workflow',
    request: {
      workspaceRoot: request.workspaceRoot,
      dataDir: request.dataDir,
      deferLedgerSuccess: request.deferLedgerSuccess ?? false,
    },
  })
  return {
    ok: raw.ok,
    report: raw.report,
    errorCode: mapErrorCode(raw.errorCode),
    errorMessage: raw.errorMessage,
  }
}

export const rustCommitShippingCiLedger = async (
  request: RustCommitShippingCiLedgerRequest,
): Promise<EpcSimpleOkResponse> => {
  const raw = await invokeCli<{ ok: boolean; error_message?: string; errorMessage?: string }>({
    command: 'commit-shipping-ci-ledger',
    request: {
      workspaceRoot: request.workspaceRoot,
      dataDir: request.dataDir,
      successes: request.successes,
    },
  })
  return mapSimpleOk(raw)
}

export const rustExportErrorAudit = async (request: ExportErrorAuditParams): Promise<ExportErrorAuditResponse> => {
  return invokeCli<ExportErrorAuditResponse>({
    command: 'export-error-audit',
    request,
  })
}

const mapSimpleOk = (raw: { ok: boolean; error_message?: string; errorMessage?: string }): EpcSimpleOkResponse => ({
  ok: raw.ok,
  errorMessage: raw.errorMessage ?? raw.error_message,
})

export const rustAppendPaymentDataPatch = async (params: EpcPaymentDataPatchParams): Promise<EpcSimpleOkResponse> => {
  const raw = await invokeCli<{ ok: boolean; error_message?: string }>({
    command: 'append-payment-data-patch',
    request: {
      workspaceRoot: params.workspaceRoot,
      patch: {
        match: params.patch.match,
        values: params.patch.values,
        lock: params.patch.lock ?? Object.keys(params.patch.values),
        source: params.patch.source,
        note: params.patch.note,
      },
    },
  })
  return mapSimpleOk(raw)
}

export const rustApplyPaymentDataOverrides = async (workspaceRoot: string): Promise<EpcSimpleOkResponse> => {
  const raw = await invokeCli<{ ok: boolean; error_message?: string }>({
    command: 'apply-payment-data-overrides',
    request: { workspaceRoot },
  })
  return mapSimpleOk(raw)
}

export const rustPropagatePmDataAfterEdit = async (
  params: import('@toolman/shared').PropagatePmDataParams,
): Promise<import('@toolman/shared').PropagatePmDataResponse> => {
  const raw = await invokeCli<{
    ok: boolean
    actions?: string[]
    error_message?: string
    errorMessage?: string
  }>({
    command: 'propagate-pm-data-after-edit',
    request: {
      workspaceRoot: params.workspaceRoot,
      editedFilePath: params.editedFilePath,
    },
  })
  return {
    ok: raw.ok,
    actions: raw.actions,
    errorMessage: raw.errorMessage ?? raw.error_message,
  }
}
