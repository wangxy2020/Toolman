import { loggerService } from '@logger'
import type { AppDispatch } from '@renderer/store'
import type { Assistant, Message } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'

import { isExplicitEngineOverwriteRequest } from '@shared/projectManagementRevision'

import { buildEpcWork5PaymentAgentContextContent, resolveEpcWork5PaymentWorkLaunch } from './epcWork5PaymentMessage'

const logger = loggerService.withContext('EpcWork5PaymentCommand')

const isPaymentWorkflowUnsupported = (message?: string): boolean =>
  Boolean(message?.includes('execute-workspace-payment-workflow') && message?.includes('unknown variant'))

const buildUnsupportedWorkflowHint = (errorMessage: string): string =>
  `步骤 1：工作流初始化
启动进度款支付数据统计工作流（execute-workspace-payment-workflow）。

失败。 ${errorMessage}

步骤 2：进度款支付数据统计
根据进度款申请资料和回款信息，统计各项目每个价格表中已完成金额、应付金额、预付款扣回金额、预留金额、生效日期、账期天数、应支付日期、实际支付日期。

失败。 工作流未成功启动，无法执行统计

诊断分析与人工修复建议
问题根因
当前 Rust 引擎版本未集成进度款支付数据统计工作流（execute-workspace-payment-workflow）。

人工修复建议
1) 联系开发团队升级 Rust 引擎并发布包含 execute-workspace-payment-workflow 的版本。
2) 临时使用现有工作4流程（execute-workspace-ipc-workflow）先完成清洗与母表写入，支付统计人工补录。
3) 确认本地 CLI 是否为最新版本（重新构建并重启应用）。`

interface RunParams {
  text: string
  accessiblePaths: string[]
  sessionTopicId: string
  assistant: Assistant
  agentId: string
  dispatch: AppDispatch
  dispatchSendMessage: (
    message: Message,
    blocks: MessageBlock[],
    assistant: Assistant,
    topicId: string,
    options: { agentId: string; sessionId: string }
  ) => any
  sessionId: string
  createUserMessageWithBlocks: (visibleText: string) => { message: Message; blocks: MessageBlock[] }
  createContextBlock: (messageId: string, contextContent: string) => MessageBlock
  quickPhraseId?: string
}

const dispatchWork5AgentTurn = ({
  visibleText,
  contextContent,
  assistant,
  agentId,
  sessionId,
  sessionTopicId,
  dispatch,
  dispatchSendMessage,
  createUserMessageWithBlocks,
  createContextBlock
}: {
  visibleText: string
  contextContent: string
} & Omit<RunParams, 'text' | 'accessiblePaths'>) => {
  const { message, blocks: visibleBlocks } = createUserMessageWithBlocks(visibleText)
  const contextBlock = createContextBlock(message.id, contextContent)
  const allBlocks = [...visibleBlocks, contextBlock]
  dispatch(
    dispatchSendMessage(
      { ...message, blocks: allBlocks.map((block) => block.id) },
      allBlocks,
      assistant,
      sessionTopicId,
      { agentId, sessionId }
    )
  )
}

/**
 * 工作 5 进度款支付数据统计入口（回车后触发本地 Rust 引擎）。
 * 引擎结果仅通过 Agent 上下文交给大模型汇报，不预插报告卡片（与工作 4 一致）。
 */
export const tryRunEpcWork5PaymentCommand = async ({
  text,
  accessiblePaths,
  sessionTopicId,
  assistant,
  agentId,
  dispatch,
  dispatchSendMessage,
  sessionId,
  createUserMessageWithBlocks,
  createContextBlock,
  quickPhraseId
}: RunParams): Promise<boolean> => {
  const launch = resolveEpcWork5PaymentWorkLaunch(text, { quickPhraseId })

  if (!launch.matched) {
    return false
  }

  logger.info('EPC work5 payment workflow matched', { sessionId })

  const visibleText = launch.visibleUserRequest
  const workflowUserRequest = launch.workflowUserRequest
  const workspaceRoot = accessiblePaths[0] ?? ''

  const buildAndDispatch = (contextContent: string) => {
    dispatchWork5AgentTurn({
      visibleText,
      contextContent,
      assistant,
      agentId,
      sessionId,
      sessionTopicId,
      dispatch,
      dispatchSendMessage,
      createUserMessageWithBlocks,
      createContextBlock
    })
  }

  if (!workspaceRoot) {
    buildAndDispatch(
      buildEpcWork5PaymentAgentContextContent({
        workspaceRoot: '（未配置）',
        visibleUserRequest: workflowUserRequest,
        period: launch.period,
        errorMessage: '请先在智能体设置中配置「可访问路径 / 工作文件夹」'
      })
    )
    return true
  }

  try {
    const response = await window.api.epcCommercial.executeWorkspacePaymentWorkflow({
      workspaceRoot,
      period: launch.period,
      ignoreRevisions: isExplicitEngineOverwriteRequest(text)
    })
    if (!response.ok) {
      const errMsg = response.errorMessage ?? '进度款支付数据统计失败'
      buildAndDispatch(
        buildEpcWork5PaymentAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          period: launch.period,
          placeholderHint: isPaymentWorkflowUnsupported(errMsg) ? buildUnsupportedWorkflowHint(errMsg) : undefined,
          errorMessage: errMsg,
          report: response.report
        })
      )
      return true
    }
    if (!response.report) {
      buildAndDispatch(
        buildEpcWork5PaymentAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          period: launch.period,
          errorMessage: '引擎未返回报告数据'
        })
      )
      return true
    }
    buildAndDispatch(
      buildEpcWork5PaymentAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        period: launch.period,
        report: response.report
      })
    )
  } catch (error) {
    logger.error('executeWorkspacePaymentWorkflow failed', error as Error)
    buildAndDispatch(
      buildEpcWork5PaymentAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        period: launch.period,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    )
  }

  return true
}
