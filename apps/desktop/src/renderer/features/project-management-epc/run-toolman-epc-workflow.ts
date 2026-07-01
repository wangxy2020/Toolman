import { isExplicitEngineOverwriteRequest } from '@toolman/shared'
import type { ContentBlock } from '@toolman/shared'

import { epcCommercialApi } from './epc-commercial-api'
import { buildEpcUserContentBlocks } from './epc-user-content-blocks'
import {
  buildEpcCommercialAgentContextContent,
  resolveEpcCommercialWorkLaunch,
} from './epcCommercialMessage'
import {
  buildEpcWork1BoqFormatAgentContextContent,
  resolveEpcWork1BoqFormatWorkLaunch,
} from './epcWork1BoqFormatMessage'
import {
  buildEpcWork2ShippingCiAgentContextContent,
  resolveEpcWork2ShippingCiWorkLaunch,
} from './epcWork2ShippingCiMessage'
import {
  buildEpcWork5PaymentAgentContextContent,
  resolveEpcWork5PaymentWorkLaunch,
} from './epcWork5PaymentMessage'

export type RunToolmanEpcWorkflowInput = {
  text: string
  quickPhraseId?: string | null
  workspaceRoot: string | null
  attachmentBlocks?: ContentBlock[]
}

export type RunToolmanEpcWorkflowResult =
  | { handled: false }
  | { handled: true; contentBlocks: ContentBlock[] }

type WorkLaunch = {
  matched: boolean
  visibleUserRequest: string
  workflowUserRequest: string
  period?: string
}

type WorkflowExecutorConfig<TReport> = {
  resolveLaunch: (
    text: string,
    options: { quickPhraseId?: string },
  ) => WorkLaunch
  execute: (args: {
    workspaceRoot: string
    input: RunToolmanEpcWorkflowInput
    launch: WorkLaunch
  }) => Promise<{ ok: boolean; errorMessage?: string; report?: TReport }>
  buildContext: (args: {
    workspaceRoot: string
    visibleUserRequest: string
    errorMessage?: string
    placeholderHint?: string
    report?: TReport
    period?: string
  }) => string
  defaultErrorMessage: string
  isUnsupported?: (message?: string) => boolean
}

const isBoqFormatWorkflowUnsupported = (message?: string): boolean =>
  Boolean(message?.includes('execute-workspace-boq-format-workflow') && message?.includes('unknown variant'))

const isPaymentWorkflowUnsupported = (message?: string): boolean =>
  Boolean(message?.includes('execute-workspace-payment-workflow') && message?.includes('unknown variant'))

const buildUnsupportedWorkflowHint = (errorMessage: string): string =>
  `步骤 1：工作流初始化失败。${errorMessage}

请在项目根目录执行 \`pnpm epc:build\` 重新编译 Rust 引擎后重启应用。`

function finish(
  visibleText: string,
  agentContext: string,
  attachmentBlocks: ContentBlock[],
): RunToolmanEpcWorkflowResult {
  return {
    handled: true,
    contentBlocks: buildEpcUserContentBlocks(visibleText, agentContext, attachmentBlocks),
  }
}

async function runEpcWorkflow<TReport>(
  input: RunToolmanEpcWorkflowInput,
  config: WorkflowExecutorConfig<TReport>,
): Promise<RunToolmanEpcWorkflowResult | null> {
  const launch = config.resolveLaunch(input.text, {
    quickPhraseId: input.quickPhraseId ?? undefined,
  })
  if (!launch.matched) return null

  const workspaceRoot = input.workspaceRoot ?? ''
  const workflowUserRequest = launch.workflowUserRequest
  const contextBase = {
    visibleUserRequest: workflowUserRequest,
    period: launch.period,
  }

  if (!workspaceRoot) {
    return finish(
      launch.visibleUserRequest,
      config.buildContext({
        workspaceRoot: '（未配置）',
        ...contextBase,
        errorMessage: '请先在智能体设置中配置工作目录',
      }),
      input.attachmentBlocks ?? [],
    )
  }

  try {
    const response = await config.execute({ workspaceRoot, input, launch })
    if (!response.ok) {
      const errMsg = response.errorMessage ?? config.defaultErrorMessage
      return finish(
        launch.visibleUserRequest,
        config.buildContext({
          workspaceRoot,
          ...contextBase,
          placeholderHint: config.isUnsupported?.(errMsg)
            ? buildUnsupportedWorkflowHint(errMsg)
            : undefined,
          errorMessage: errMsg,
          report: response.report,
        }),
        input.attachmentBlocks ?? [],
      )
    }
    return finish(
      launch.visibleUserRequest,
      config.buildContext({
        workspaceRoot,
        ...contextBase,
        errorMessage: response.report ? undefined : '引擎未返回报告数据',
        report: response.report,
      }),
      input.attachmentBlocks ?? [],
    )
  } catch (error) {
    return finish(
      launch.visibleUserRequest,
      config.buildContext({
        workspaceRoot,
        ...contextBase,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
      input.attachmentBlocks ?? [],
    )
  }
}

const WORKFLOW_RUNNERS: Array<
  (input: RunToolmanEpcWorkflowInput) => Promise<RunToolmanEpcWorkflowResult | null>
> = [
  (input) =>
    runEpcWorkflow(input, {
      resolveLaunch: resolveEpcWork1BoqFormatWorkLaunch,
      execute: ({ workspaceRoot }) => epcCommercialApi.executeWorkspaceBoqFormatWorkflow({ workspaceRoot }),
      buildContext: buildEpcWork1BoqFormatAgentContextContent,
      defaultErrorMessage: '合同价格表格式化失败',
      isUnsupported: isBoqFormatWorkflowUnsupported,
    }),
  (input) =>
    runEpcWorkflow(input, {
      resolveLaunch: resolveEpcWork2ShippingCiWorkLaunch,
      execute: ({ workspaceRoot }) => epcCommercialApi.executeWorkspaceShippingCiWorkflow({ workspaceRoot }),
      buildContext: buildEpcWork2ShippingCiAgentContextContent,
      defaultErrorMessage: '商业发票编制失败',
    }),
  (input) =>
    runEpcWorkflow(input, {
      resolveLaunch: resolveEpcCommercialWorkLaunch,
      execute: ({ workspaceRoot, input: workflowInput }) =>
        epcCommercialApi.executeWorkspaceIpcWorkflow({
          workspaceRoot,
          ignoreRevisions: isExplicitEngineOverwriteRequest(workflowInput.text),
        }),
      buildContext: buildEpcCommercialAgentContextContent,
      defaultErrorMessage: 'IPC 工作流执行失败',
    }),
  (input) =>
    runEpcWorkflow(input, {
      resolveLaunch: resolveEpcWork5PaymentWorkLaunch,
      execute: ({ workspaceRoot, input: workflowInput, launch }) =>
        epcCommercialApi.executeWorkspacePaymentWorkflow({
          workspaceRoot,
          period: launch.period,
          ignoreRevisions: isExplicitEngineOverwriteRequest(workflowInput.text),
        }),
      buildContext: buildEpcWork5PaymentAgentContextContent,
      defaultErrorMessage: '进度款支付数据统计失败',
      isUnsupported: isPaymentWorkflowUnsupported,
    }),
]

export async function tryRunToolmanEpcWorkflow(
  input: RunToolmanEpcWorkflowInput,
): Promise<RunToolmanEpcWorkflowResult> {
  for (const runner of WORKFLOW_RUNNERS) {
    const result = await runner(input)
    if (result) return result
  }
  return { handled: false }
}
