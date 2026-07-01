import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from './epc-logger.js'
import {
  isRustEngineAvailable,
  rustExecuteWorkspaceIpcWorkflow,
  rustAppendPaymentDataPatch,
  rustApplyPaymentDataOverrides,
  rustExecuteWorkspaceBoqFormatWorkflow,
  rustExecuteWorkspacePaymentWorkflow,
  rustExecuteWorkspaceShippingCiWorkflow,
  rustExportErrorAudit,
  rustGetMachineId,
} from './rustCli'
import { applyShippingCiWriteJobs } from './epcCommercialShippingCiWrites.js'
import type {
  EpcCommercialLicenseStatus,
  EpcPaymentDataPatchParams,
  EpcSimpleOkResponse,
  EpcWorkflowLogAppendParams,
  EpcWorkflowLogParams,
  ExportErrorAuditParams,
  ExportErrorAuditResponse,
  IpcAlignmentExecuteParams,
  IpcAlignmentExecuteResponse,
  BoqFormatWorkflowExecuteResponse,
  PaymentWorkflowExecuteResponse,
  ShippingCiWorkflowExecuteResponse,
  WorkspaceBoqFormatWorkflowParams,
  WorkspacePaymentWorkflowParams,
  WorkspaceIpcWorkflowParams,
  WorkspaceShippingCiWorkflowParams
} from '@toolman/shared'
import { EPC_WORKFLOW_LOG_HEADER, formatWorkflowLogAppendBlock, workflowLogPathForWork } from '@toolman/shared'
import { app } from 'electron'

const logger = loggerService.withContext('EpcCommercialService')

const getDataDir = (): string => {
  const dir = path.join(app.getPath('userData'), 'epc-commercial')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export class EpcCommercialService {
  getMachineId = async (): Promise<string> => {
    if (!isRustEngineAvailable()) {
      return 'ENGINE_NOT_AVAILABLE'
    }
    const result = await rustGetMachineId()
    return result.machineId
  }

  getLicenseStatus = async (): Promise<EpcCommercialLicenseStatus> => {
    const machineId = await this.getMachineId()
    const licensePath = path.join(getDataDir(), 'license.key')
    if (!fs.existsSync(licensePath)) {
      return {
        valid: false,
        machineId,
        message: '未找到 license.key，请联系供应商获取离线授权文件'
      }
    }

    if (!isRustEngineAvailable()) {
      return { valid: false, machineId, message: 'Rust 引擎未编译或未打包' }
    }
    return { valid: true, machineId, message: '已检测到 license.key（执行时将校验签名与到期时间）' }
  }

  executeWorkspaceIpcWorkflow = async (params: WorkspaceIpcWorkflowParams): Promise<IpcAlignmentExecuteResponse> => {
    if (!isRustEngineAvailable()) {
      return {
        ok: false,
        errorCode: 'ENGINE_NOT_FOUND',
        errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build'
      }
    }

    const workspaceRoot = params.workspaceRoot
    if (!fs.existsSync(workspaceRoot)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGS',
        errorMessage: `工作区目录不存在: ${workspaceRoot}`
      }
    }

    try {
      return await rustExecuteWorkspaceIpcWorkflow({
        workspaceRoot,
        period: params.period,
        masterPricePath: params.masterPricePath,
        dataDir: getDataDir(),
        ignoreRevisions: params.ignoreRevisions
      })
    } catch (error) {
      logger.error('executeWorkspaceIpcWorkflow failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }

  executeIpcAlignment = async (params: IpcAlignmentExecuteParams): Promise<IpcAlignmentExecuteResponse> => {
    return this.executeWorkspaceIpcWorkflow({
      workspaceRoot: params.ipcRootPath,
      period: params.period,
      masterPricePath: params.masterPricePath
    })
  }

  executeWorkspaceBoqFormatWorkflow = async (
    params: WorkspaceBoqFormatWorkflowParams
  ): Promise<BoqFormatWorkflowExecuteResponse> => {
    if (!isRustEngineAvailable()) {
      return {
        ok: false,
        errorCode: 'ENGINE_NOT_FOUND',
        errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build'
      }
    }
    const workspaceRoot = params.workspaceRoot
    if (!fs.existsSync(workspaceRoot)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGS',
        errorMessage: `工作区目录不存在: ${workspaceRoot}`
      }
    }
    try {
      return await rustExecuteWorkspaceBoqFormatWorkflow({
        workspaceRoot,
        dataDir: getDataDir()
      })
    } catch (error) {
      logger.error('executeWorkspaceBoqFormatWorkflow failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }

  executeWorkspaceShippingCiWorkflow = async (
    params: WorkspaceShippingCiWorkflowParams
  ): Promise<ShippingCiWorkflowExecuteResponse> => {
    if (!isRustEngineAvailable()) {
      return {
        ok: false,
        errorCode: 'ENGINE_NOT_FOUND',
        errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build'
      }
    }
    const workspaceRoot = params.workspaceRoot
    if (!fs.existsSync(workspaceRoot)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGS',
        errorMessage: `工作区目录不存在: ${workspaceRoot}`
      }
    }
    try {
      const response = await rustExecuteWorkspaceShippingCiWorkflow({
        workspaceRoot,
        dataDir: getDataDir(),
        deferLedgerSuccess: true
      })
      if (!response.ok) {
        return response
      }
      if (!response.report) {
        return response
      }
      const writeError = await applyShippingCiWriteJobs(response.report, {
        workspaceRoot,
        dataDir: getDataDir(),
        successes: response.report.pendingLedgerCommits ?? [],
      })
      if (writeError) {
        logger.error('applyShippingCiWriteJobs failed', { errorMessage: writeError.errorMessage })
        return writeError
      }
      return response
    } catch (error) {
      logger.error('executeWorkspaceShippingCiWorkflow failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }

  executeWorkspacePaymentWorkflow = async (
    params: WorkspacePaymentWorkflowParams
  ): Promise<PaymentWorkflowExecuteResponse> => {
    if (!isRustEngineAvailable()) {
      return {
        ok: false,
        errorCode: 'ENGINE_NOT_FOUND',
        errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build'
      }
    }
    const workspaceRoot = params.workspaceRoot
    if (!fs.existsSync(workspaceRoot)) {
      return {
        ok: false,
        errorCode: 'INVALID_ARGS',
        errorMessage: `工作区目录不存在: ${workspaceRoot}`
      }
    }
    try {
      return await rustExecuteWorkspacePaymentWorkflow({
        workspaceRoot,
        period: params.period,
        dataDir: getDataDir(),
        ignoreRevisions: params.ignoreRevisions
      })
    } catch (error) {
      logger.error('executeWorkspacePaymentWorkflow failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private resolveWorkflowLogPath(workspaceRoot: string, work: EpcWorkflowLogParams['work']): string {
    const root = path.resolve(workspaceRoot)
    const logPath = path.resolve(workflowLogPathForWork(root, work))
    if (!logPath.startsWith(root + path.sep) && logPath !== root) {
      throw new Error('工作区 log.txt 路径无效')
    }
    return logPath
  }

  readWorkflowLog = async (params: EpcWorkflowLogParams): Promise<string> => {
    const logPath = this.resolveWorkflowLogPath(params.workspaceRoot, params.work)
    if (!fs.existsSync(logPath)) {
      return ''
    }
    return fs.readFileSync(logPath, 'utf-8')
  }

  appendWorkflowLog = async (params: EpcWorkflowLogAppendParams): Promise<void> => {
    const logPath = this.resolveWorkflowLogPath(params.workspaceRoot, params.work)
    const content = params.content.trim()
    if (!content) {
      return
    }
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, EPC_WORKFLOW_LOG_HEADER, 'utf-8')
    }
    const existing = fs.readFileSync(logPath, 'utf-8')
    if (existing.includes(content)) {
      return
    }
    fs.appendFileSync(logPath, formatWorkflowLogAppendBlock(content), 'utf-8')
  }

  appendPaymentDataPatch = async (params: EpcPaymentDataPatchParams): Promise<EpcSimpleOkResponse> => {
    if (!isRustEngineAvailable()) {
      return { ok: false, errorMessage: 'Rust 引擎不可用' }
    }
    try {
      return await rustAppendPaymentDataPatch(params)
    } catch (error) {
      logger.error('appendPaymentDataPatch failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, errorMessage: error instanceof Error ? error.message : String(error) }
    }
  }

  applyPaymentDataOverrides = async (workspaceRoot: string): Promise<EpcSimpleOkResponse> => {
    if (!isRustEngineAvailable()) {
      return { ok: false, errorMessage: 'Rust 引擎不可用' }
    }
    try {
      return await rustApplyPaymentDataOverrides(workspaceRoot)
    } catch (error) {
      logger.error('applyPaymentDataOverrides failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { ok: false, errorMessage: error instanceof Error ? error.message : String(error) }
    }
  }

  exportErrorAudit = async (params: ExportErrorAuditParams): Promise<ExportErrorAuditResponse> => {
    if (!isRustEngineAvailable()) {
      return { ok: false, errorMessage: 'Rust 引擎不可用' }
    }
    try {
      return await rustExportErrorAudit({
        dataDir: params.dataDir || getDataDir(),
        period: params.period,
        outputPath: params.outputPath,
        errors: params.errors
      })
    } catch (error) {
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export const getEpcCommercialDataDir = getDataDir

export const epcCommercialService = new EpcCommercialService()
