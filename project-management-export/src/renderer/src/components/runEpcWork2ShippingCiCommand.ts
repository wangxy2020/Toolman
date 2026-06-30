import { loggerService } from '@logger'
import type { AppDispatch } from '@renderer/store'
import type { Assistant, Message } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'

import {
  buildEpcWork2ShippingCiAgentContextContent,
  resolveEpcWork2ShippingCiWorkLaunch
} from './epcWork2ShippingCiMessage'

const logger = loggerService.withContext('EpcWork2ShippingCiCommand')

const isUnsupported = (message?: string): boolean =>
  Boolean(message?.includes('execute-workspace-shipping-ci-workflow') && message?.includes('unknown variant'))

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

export const tryRunEpcWork2ShippingCiCommand = async ({
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
  const launch = resolveEpcWork2ShippingCiWorkLaunch(text, { quickPhraseId })
  if (!launch.matched) {
    return false
  }

  logger.info('EPC work2 shipping CI workflow matched', { sessionId })

  const visibleText = launch.visibleUserRequest
  const workflowUserRequest = launch.workflowUserRequest
  const workspaceRoot = accessiblePaths[0] ?? ''

  const dispatchTurn = (contextContent: string) => {
    const { message, blocks: visibleBlocks } = createUserMessageWithBlocks(visibleText)
    const contextBlock = createContextBlock(message.id, contextContent)
    const allBlocks = [...visibleBlocks, contextBlock]
    dispatch(
      dispatchSendMessage(
        { ...message, blocks: allBlocks.map((b) => b.id) },
        allBlocks,
        assistant,
        sessionTopicId,
        { agentId, sessionId }
      )
    )
  }

  if (!workspaceRoot) {
    dispatchTurn(
      buildEpcWork2ShippingCiAgentContextContent({
        workspaceRoot: '（未配置）',
        visibleUserRequest: workflowUserRequest,
        errorMessage: '请先在智能体设置中配置「可访问路径 / 工作文件夹」'
      })
    )
    return true
  }

  try {
    const response = await window.api.epcCommercial.executeWorkspaceShippingCiWorkflow({ workspaceRoot })
    if (!response.ok) {
      const errMsg = response.errorMessage ?? '商业发票编制失败'
      dispatchTurn(
        buildEpcWork2ShippingCiAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          placeholderHint: isUnsupported(errMsg)
            ? `步骤 1：工作流初始化失败。${errMsg}\n\n请在项目根目录执行 \`pnpm epc:build\` 后重启应用。`
            : undefined,
          errorMessage: errMsg,
          report: response.report
        })
      )
      return true
    }
    if (!response.report) {
      dispatchTurn(
        buildEpcWork2ShippingCiAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          errorMessage: '引擎未返回报告数据'
        })
      )
      return true
    }
    dispatchTurn(
      buildEpcWork2ShippingCiAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        report: response.report
      })
    )
  } catch (error) {
    logger.error('executeWorkspaceShippingCiWorkflow failed', error as Error)
    dispatchTurn(
      buildEpcWork2ShippingCiAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    )
  }

  return true
}
