import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { getResourcePath } from '@main/utils'
import type {
  EpcPaymentDataPatchParams,
  EpcSimpleOkResponse,
  ExportErrorAuditParams,
  ExportErrorAuditResponse,
  IpcAlignmentExecuteResponse,
  BoqFormatWorkflowExecuteResponse,
  PaymentWorkflowExecuteResponse,
  ShippingCiWorkflowExecuteResponse
} from '@shared/epcCommercialTypes'
import { app } from 'electron'

const logger = loggerService.withContext('EpcCommercialRustCli')

const CLI_NAME = process.platform === 'win32' ? 'epc-commercial-cli.exe' : 'epc-commercial-cli'

const devCliCandidates = (): string[] => {
  const roots = new Set<string>()
  roots.add(process.cwd())
  if (!app.isPackaged) {
    roots.add(app.getAppPath())
    roots.add(path.join(app.getAppPath(), '..'))
  }
  const paths: string[] = []
  for (const root of roots) {
    paths.push(path.join(root, 'packages/epc-commercial-engine/target/release', CLI_NAME))
  }
  // 仅当 release 不存在时才回退 debug（避免误用 months-old 的 debug 构建）
  for (const root of roots) {
    const debug = path.join(root, 'packages/epc-commercial-engine/target/debug', CLI_NAME)
    const release = path.join(root, 'packages/epc-commercial-engine/target/release', CLI_NAME)
    if (!fs.existsSync(release)) {
      paths.push(debug)
    }
  }
  return paths
}

const resolveCliPath = (): string | null => {
  const devCandidates = devCliCandidates()
  const bundledCandidate = path.join(getResourcePath(), 'epc-commercial', CLI_NAME)
  const candidates = app.isPackaged ? [bundledCandidate, ...devCandidates] : [...devCandidates, bundledCandidate]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      let mtime: string | undefined
      try {
        mtime = fs.statSync(candidate).mtime.toISOString()
      } catch {
        mtime = undefined
      }
      logger.info('Resolved epc-commercial-cli', {
        cliPath: candidate,
        isPackaged: app.isPackaged,
        mtime
      })
      return candidate
    }
  }
  return null
}

const isUnknownWorkspaceIpcCommand = (message?: string): boolean =>
  Boolean(
    message?.includes('unknown variant') &&
      (message?.includes('execute-workspace-ipc-workflow') ||
        message?.includes('execute-workspace-boq-workflow'))
  )
const isUnknownWorkspaceBoqFormatCommand = (message?: string): boolean =>
  Boolean(message?.includes('unknown variant') && message?.includes('execute-workspace-boq-format-workflow'))
const isUnknownWorkspacePaymentCommand = (message?: string): boolean =>
  Boolean(message?.includes('unknown variant') && message?.includes('execute-workspace-payment-workflow'))

/** 开发包未打包时默认跳过 license；也可用 EPC_COMMERCIAL_DEV_SKIP_LICENSE=1 显式开启 */
const shouldSkipLicenseForCli = (): boolean => process.env.EPC_COMMERCIAL_DEV_SKIP_LICENSE === '1' || !app.isPackaged

const buildCliChildEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env }
  if (shouldSkipLicenseForCli()) {
    env.EPC_COMMERCIAL_DEV_SKIP_LICENSE = '1'
  }
  return env
}

const invokeCli = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const cliPath = resolveCliPath()
  if (!cliPath) {
    throw new Error('ENGINE_NOT_FOUND')
  }

  const input = JSON.stringify(payload)
  const childEnv = buildCliChildEnv()

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, [], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (!stdout.trim()) {
        logger.error('Rust CLI empty stdout', { stderr, code, cliPath })
        reject(new Error(stderr || `Rust CLI exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as T)
      } catch (error) {
        logger.error('Failed to parse Rust CLI JSON', { stdout, stderr, error })
        reject(error)
      }
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

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
  request: RustIpcAlignmentRequest
): Promise<IpcAlignmentExecuteResponse> => {
  return rustExecuteWorkspaceIpcWorkflow({
    workspaceRoot: request.ipcRootPath,
    period: request.period,
    masterPricePath: request.masterPricePath,
    dataDir: request.dataDir
  })
}

const mapWorkspaceIpcCliResponse = (raw: {
  ok: boolean
  report?: IpcAlignmentExecuteResponse['report']
  errorCode?: string
  errorMessage?: string
}): IpcAlignmentExecuteResponse => ({
  ok: raw.ok,
  report: raw.report,
  errorCode: mapErrorCode(raw.errorCode),
  errorMessage: raw.errorMessage
})

export const rustExecuteWorkspaceIpcWorkflow = async (
  request: RustWorkspaceIpcWorkflowRequest
): Promise<IpcAlignmentExecuteResponse> => {
  const workspaceRequest = {
    workspaceRoot: request.workspaceRoot,
    period: request.period ?? null,
    masterPricePath: request.masterPricePath ?? null,
    dataDir: request.dataDir,
    ignoreRevisions: request.ignoreRevisions ?? null
  }

  const raw = await invokeCli<{
    ok: boolean
    report?: IpcAlignmentExecuteResponse['report']
    errorCode?: string
    errorMessage?: string
  }>({
    command: 'execute-workspace-ipc-workflow',
    request: workspaceRequest
  })

  if (raw.ok || !isUnknownWorkspaceIpcCommand(raw.errorMessage)) {
    return mapWorkspaceIpcCliResponse(raw)
  }

  logger.warn('Rust CLI missing execute-workspace-ipc-workflow; falling back to execute-ipc-alignment', {
    errorMessage: raw.errorMessage
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
      dataDir: request.dataDir
    }
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
    errorMessage: isUnknownWorkspaceBoqFormatCommand(raw.errorMessage) ? unsupportedMessage : raw.errorMessage
  }
}

export const rustExecuteWorkspaceBoqFormatWorkflow = async (
  request: RustWorkspaceBoqFormatWorkflowRequest
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
      dataDir: request.dataDir
    }
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
    errorMessage: isUnknownWorkspacePaymentCommand(raw.errorMessage) ? unsupportedMessage : raw.errorMessage
  }
}

export const rustExecuteWorkspacePaymentWorkflow = async (
  request: RustWorkspacePaymentWorkflowRequest
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
      ignoreRevisions: request.ignoreRevisions ?? null
    }
  })
  return mapWorkspacePaymentCliResponse(raw)
}

export const rustExecuteWorkspaceShippingCiWorkflow = async (
  request: RustWorkspaceShippingCiWorkflowRequest
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
      deferLedgerSuccess: request.deferLedgerSuccess ?? false
    }
  })
  return {
    ok: raw.ok,
    report: raw.report,
    errorCode: mapErrorCode(raw.errorCode),
    errorMessage: raw.errorMessage
  }
}

export const rustCommitShippingCiLedger = async (
  request: RustCommitShippingCiLedgerRequest
): Promise<EpcSimpleOkResponse> => {
  const raw = await invokeCli<{ ok: boolean; error_message?: string; errorMessage?: string }>({
    command: 'commit-shipping-ci-ledger',
    request: {
      workspaceRoot: request.workspaceRoot,
      dataDir: request.dataDir,
      successes: request.successes
    }
  })
  return mapSimpleOk(raw)
}

export const rustExportErrorAudit = async (request: ExportErrorAuditParams): Promise<ExportErrorAuditResponse> => {
  return invokeCli<ExportErrorAuditResponse>({
    command: 'export-error-audit',
    request
  })
}

const mapSimpleOk = (raw: { ok: boolean; error_message?: string; errorMessage?: string }): EpcSimpleOkResponse => ({
  ok: raw.ok,
  errorMessage: raw.errorMessage ?? raw.error_message
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
        note: params.patch.note
      }
    }
  })
  return mapSimpleOk(raw)
}

export const rustApplyPaymentDataOverrides = async (workspaceRoot: string): Promise<EpcSimpleOkResponse> => {
  const raw = await invokeCli<{ ok: boolean; error_message?: string }>({
    command: 'apply-payment-data-overrides',
    request: { workspaceRoot }
  })
  return mapSimpleOk(raw)
}

export const rustPropagatePmDataAfterEdit = async (
  params: import('@shared/epcCommercialTypes').PropagatePmDataParams
): Promise<import('@shared/epcCommercialTypes').PropagatePmDataResponse> => {
  const raw = await invokeCli<{
    ok: boolean
    actions?: string[]
    error_message?: string
    errorMessage?: string
  }>({
    command: 'propagate-pm-data-after-edit',
    request: {
      workspaceRoot: params.workspaceRoot,
      editedFilePath: params.editedFilePath
    }
  })
  return {
    ok: raw.ok,
    actions: raw.actions,
    errorMessage: raw.errorMessage ?? raw.error_message
  }
}

const mapErrorCode = (code?: string): IpcAlignmentExecuteResponse['errorCode'] => {
  if (code === 'AUTH_EXPIRED') return 'AUTH_EXPIRED'
  if (code === 'INVALID_ARGS') return 'INVALID_ARGS'
  if (code === 'INTERNAL_ERROR') return 'INTERNAL_ERROR'
  if (code === 'FILE_LOCKED') return 'FILE_LOCKED'
  return undefined
}

export const isRustEngineAvailable = (): boolean => resolveCliPath() !== null
