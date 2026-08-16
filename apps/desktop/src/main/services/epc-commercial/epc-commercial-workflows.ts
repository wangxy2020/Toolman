import fs from 'node:fs'

import { loggerService } from './epc-logger.js'
import {
  isRustEngineAvailable,
  rustExecuteWorkspaceIpcWorkflow,
  rustExecuteWorkspaceBoqFormatWorkflow,
  rustExecuteWorkspacePaymentWorkflow,
  rustExecuteWorkspaceShippingCiWorkflow,
} from './rustCli'
import { applyShippingCiWriteJobs } from './epcCommercialShippingCiWrites.js'
import type {
  IpcAlignmentExecuteParams,
  IpcAlignmentExecuteResponse,
  BoqFormatWorkflowExecuteResponse,
  PaymentWorkflowExecuteResponse,
  ShippingCiWorkflowExecuteResponse,
  WorkspaceBoqFormatWorkflowParams,
  WorkspacePaymentWorkflowParams,
  WorkspaceIpcWorkflowParams,
  WorkspaceShippingCiWorkflowParams,
} from '@toolman/shared'
import { getEpcCommercialDataDir } from './epc-commercial-paths'

const logger = loggerService.withContext('EpcCommercialService')

export async function executeWorkspaceIpcWorkflow(
  params: WorkspaceIpcWorkflowParams,
): Promise<IpcAlignmentExecuteResponse> {
  if (!isRustEngineAvailable()) {
    return {
      ok: false,
      errorCode: 'ENGINE_NOT_FOUND',
      errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build',
    }
  }

  const workspaceRoot = params.workspaceRoot
  if (!fs.existsSync(workspaceRoot)) {
    return {
      ok: false,
      errorCode: 'INVALID_ARGS',
      errorMessage: `工作区目录不存在: ${workspaceRoot}`,
    }
  }

  try {
    return await rustExecuteWorkspaceIpcWorkflow({
      workspaceRoot,
      period: params.period,
      masterPricePath: params.masterPricePath,
      dataDir: getEpcCommercialDataDir(),
      ignoreRevisions: params.ignoreRevisions,
    })
  } catch (error) {
    logger.error('executeWorkspaceIpcWorkflow failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      errorCode: 'INTERNAL_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function executeIpcAlignment(
  params: IpcAlignmentExecuteParams,
): Promise<IpcAlignmentExecuteResponse> {
  return executeWorkspaceIpcWorkflow({
    workspaceRoot: params.ipcRootPath,
    period: params.period,
    masterPricePath: params.masterPricePath,
  })
}

export async function executeWorkspaceBoqFormatWorkflow(
  params: WorkspaceBoqFormatWorkflowParams,
): Promise<BoqFormatWorkflowExecuteResponse> {
  if (!isRustEngineAvailable()) {
    return {
      ok: false,
      errorCode: 'ENGINE_NOT_FOUND',
      errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build',
    }
  }
  const workspaceRoot = params.workspaceRoot
  if (!fs.existsSync(workspaceRoot)) {
    return {
      ok: false,
      errorCode: 'INVALID_ARGS',
      errorMessage: `工作区目录不存在: ${workspaceRoot}`,
    }
  }
  try {
    return await rustExecuteWorkspaceBoqFormatWorkflow({
      workspaceRoot,
      dataDir: getEpcCommercialDataDir(),
    })
  } catch (error) {
    logger.error('executeWorkspaceBoqFormatWorkflow failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      errorCode: 'INTERNAL_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function executeWorkspaceShippingCiWorkflow(
  params: WorkspaceShippingCiWorkflowParams,
): Promise<ShippingCiWorkflowExecuteResponse> {
  if (!isRustEngineAvailable()) {
    return {
      ok: false,
      errorCode: 'ENGINE_NOT_FOUND',
      errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build',
    }
  }
  const workspaceRoot = params.workspaceRoot
  if (!fs.existsSync(workspaceRoot)) {
    return {
      ok: false,
      errorCode: 'INVALID_ARGS',
      errorMessage: `工作区目录不存在: ${workspaceRoot}`,
    }
  }
  try {
    const response = await rustExecuteWorkspaceShippingCiWorkflow({
      workspaceRoot,
      dataDir: getEpcCommercialDataDir(),
      deferLedgerSuccess: true,
    })
    if (!response.ok) {
      return response
    }
    if (!response.report) {
      return response
    }
    const writeError = await applyShippingCiWriteJobs(response.report, {
      workspaceRoot,
      dataDir: getEpcCommercialDataDir(),
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
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function executeWorkspacePaymentWorkflow(
  params: WorkspacePaymentWorkflowParams,
): Promise<PaymentWorkflowExecuteResponse> {
  if (!isRustEngineAvailable()) {
    return {
      ok: false,
      errorCode: 'ENGINE_NOT_FOUND',
      errorMessage: '未找到 epc-commercial-cli。请在项目根目录执行: pnpm epc:build',
    }
  }
  const workspaceRoot = params.workspaceRoot
  if (!fs.existsSync(workspaceRoot)) {
    return {
      ok: false,
      errorCode: 'INVALID_ARGS',
      errorMessage: `工作区目录不存在: ${workspaceRoot}`,
    }
  }
  try {
    return await rustExecuteWorkspacePaymentWorkflow({
      workspaceRoot,
      period: params.period,
      dataDir: getEpcCommercialDataDir(),
      ignoreRevisions: params.ignoreRevisions,
    })
  } catch (error) {
    logger.error('executeWorkspacePaymentWorkflow failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      errorCode: 'INTERNAL_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}
