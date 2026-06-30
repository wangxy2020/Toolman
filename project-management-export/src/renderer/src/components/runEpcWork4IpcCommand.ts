import { loggerService } from '@logger'
import type { AppDispatch } from '@renderer/store'
import type { Assistant, Message } from '@renderer/types'
import type { MessageBlock } from '@renderer/types/newMessage'

import { isExplicitEngineOverwriteRequest } from '@shared/projectManagementRevision'

import { buildEpcCommercialAgentContextContent, resolveEpcCommercialWorkLaunch } from './epcCommercialMessage'

const logger = loggerService.withContext('EpcWork4IpcCommand')

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

const dispatchWork4AgentTurn = ({
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
 * 工作 4 进度款工程量数据统计入口（回车后触发本地 Rust 引擎）。
 * 引擎结果仅通过 Agent 上下文交给大模型汇报，不预插报告卡片（与工作 1 / 5 一致）。
 */
export const tryRunEpcWork4IpcCommand = async ({
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
  const launch = resolveEpcCommercialWorkLaunch(text, { quickPhraseId })

  if (!launch.matched) {
    return false
  }

  logger.info('EPC work4 ipc workflow matched, starting local engine', { sessionId })

  const visibleText = launch.visibleUserRequest
  const workflowUserRequest = launch.workflowUserRequest
  const workspaceRoot = accessiblePaths[0] ?? ''

  const buildAndDispatch = (contextContent: string) => {
    dispatchWork4AgentTurn({
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
      buildEpcCommercialAgentContextContent({
        workspaceRoot: '（未配置）',
        visibleUserRequest: workflowUserRequest,
        errorMessage: '请先在智能体设置中配置「可访问路径 / 工作文件夹」'
      })
    )
    return true
  }

  try {
    const response = await window.api.epcCommercial.executeWorkspaceIpcWorkflow({
      workspaceRoot,
      ignoreRevisions: isExplicitEngineOverwriteRequest(text)
    })
    if (!response.ok) {
      const errMsg = response.errorMessage ?? 'IPC 工作流执行失败'
      buildAndDispatch(
        buildEpcCommercialAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          errorMessage: errMsg,
          report: response.report
        })
      )
      return true
    }

    if (!response.report) {
      buildAndDispatch(
        buildEpcCommercialAgentContextContent({
          workspaceRoot,
          visibleUserRequest: workflowUserRequest,
          errorMessage: '引擎未返回报告数据'
        })
      )
      return true
    }

    buildAndDispatch(
      buildEpcCommercialAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        report: response.report
      })
    )
  } catch (error) {
    logger.error('executeWorkspaceIpcWorkflow failed', error as Error)
    buildAndDispatch(
      buildEpcCommercialAgentContextContent({
        workspaceRoot,
        visibleUserRequest: workflowUserRequest,
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    )
  }

  return true
}
