import { loggerService } from '@logger'
import type { AppDispatch } from '@renderer/store'
import type { Assistant, Message } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'

import { buildEpcWork1BoqFormatAgentContextContent, resolveEpcWork1BoqFormatWorkLaunch } from './epcWork1BoqFormatMessage'

const logger = loggerService.withContext('EpcWork1BoqFormatCommand')

const isBoqFormatWorkflowUnsupported = (message?: string): boolean =>
  Boolean(message?.includes('execute-workspace-boq-format-workflow') && message?.includes('unknown variant'))

const buildUnsupportedWorkflowHint = (errorMessage: string): string =>
  `步骤 1：工作流初始化失败。${errorMessage}

请在项目根目录执行 \`pnpm epc:build\` 重新编译 Rust 引擎后重启应用。`

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

const dispatchWork1AgentTurn = ({
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

export const tryRunEpcWork1BoqFormatCommand = async ({
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
  const launch = resolveEpcWork1BoqFormatWorkLaunch(text, { quickPhraseId })
  if (!launch.matched) {
    return false
  }

  logger.info('EPC work1 boq format workflow matched', { sessionId })

  const visibleText = launch.visibleUserRequest
  const workflowUserRequest = launch.workflowUserRequest
  const workspaceRoot = accessiblePaths[0] ?? ''

  const buildAndDispatch = (contextContent: string) => {
    dispatchWork1AgentTurn({
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
      buildEpcWork1BoqFormatAgentContextContent({
        workspaceRoot: '（未配置）',
        visibleUserRequest: workflowUserRequest,
        errorMessage: '请先在智能体设置中配置「可访问路径 / 工作文件夹」'
      })
    )
    return true
  }

  try {
    const response = await window.api.epcCommercial.executeWorkspaceBoqFormatWorkflow({ workspaceRoot })
    if (!response.ok) {
      const errMsg = response.errorMessage ?? '合同价格表格式化失败'
      buildAndDispatch(
        buildEpcWork1BoqFormatAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          placeholderHint: isBoqFormatWorkflowUnsupported(errMsg)
            ? buildUnsupportedWorkflowHint(errMsg)
            : undefined,
          errorMessage: errMsg,
          report: response.report
        })
      )
      return true
    }
    if (!response.report) {
      buildAndDispatch(
        buildEpcWork1BoqFormatAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          errorMessage: '引擎未返回报告数据'
        })
      )
      return true
    }
    buildAndDispatch(
      buildEpcWork1BoqFormatAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        report: response.report
      })
    )
  } catch (error) {
    logger.error('executeWorkspaceBoqFormatWorkflow failed', error as Error)
    buildAndDispatch(
      buildEpcWork1BoqFormatAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    )
  }

  return true
}
