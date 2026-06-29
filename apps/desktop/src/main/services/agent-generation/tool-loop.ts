import { toErrorMessage } from '@toolman/shared'
import type { ChatMessage } from '@toolman/model-gateway'
import type { Message } from '@toolman/shared'
import { ProviderError } from '@toolman/model-gateway'
import type { parseAssistantRuntime } from '../agent.service'
import { evaluateToolPermission, isDeleteTool } from '../permission.service'
import {
  requestToolApproval,
  grantToolApprovalScope,
  hasToolApprovalScope,
} from '../tool-approval.service'
import { executeToolCall } from '../tool-executor.service'
import type { getProviderConfig } from '../provider.service'
import type { GenerationStreamContext } from './types'
import {
  LIST_TOOL_RESULT_DISPLAY_LIMIT,
  LIST_TOOL_SHORT_NAMES,
  TOOL_RESULT_DISPLAY_LIMIT,
} from './types'
import { getModelGateway } from './stream-completion'
import { streamPlainCompletion } from './stream-completion'

export async function runToolLoop(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  model: string
  chatMessages: ChatMessage[]
  tools: Awaited<ReturnType<typeof import('../tool-registry').resolveToolDefinitions>>
  runtime: ReturnType<typeof parseAssistantRuntime>
  effectivePermissionMode: string
  sessionApprovalScopeKey: string
  signal: AbortSignal
  stream: GenerationStreamContext
  onUsage: (usage: Message['tokenUsage']) => void
}): Promise<void> {
  const gateway = getModelGateway()
  const { stream, runtime } = options

  try {
    let round = 0
    let hitToolRoundLimit = false
    while (round < runtime.sessionRoundLimit) {
      const completion = await gateway.chatComplete(options.providerConfig, {
        model: options.model,
        messages: options.chatMessages,
        tools: options.tools,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        signal: options.signal,
      })

      if (completion.usage) {
        options.onUsage({
          prompt: completion.usage.prompt,
          completion: completion.usage.completion,
          total: completion.usage.total,
        })
      }

      if (completion.toolCalls.length > 0) {
        options.chatMessages.push({
          role: 'assistant',
          content: completion.content || '',
          tool_calls: completion.toolCalls,
        })

        for (const call of completion.toolCalls) {
          let sqlStatement: string | undefined
          try {
            const parsed = JSON.parse(call.arguments) as { sql?: string }
            sqlStatement = typeof parsed.sql === 'string' ? parsed.sql : undefined
          } catch {
            sqlStatement = undefined
          }

          stream.emitToolUpdate({
            toolCallId: call.id,
            name: call.name,
            arguments: call.arguments?.trim() || undefined,
            status: 'running',
          })

          const permission = evaluateToolPermission({
            toolName: call.name,
            permissionMode: runtime.permissionMode,
            toolStates: runtime.toolStates,
            sqlStatement,
            autonomousMode: runtime.autonomousMode,
          })

          let result: string
          if (!permission.allowed && permission.requiresApproval) {
            const skipApproval =
              hasToolApprovalScope(options.sessionApprovalScopeKey) &&
              !(runtime.autonomousMode && isDeleteTool(call.name))

            if (skipApproval) {
              try {
                result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
              } catch (error) {
                result = `Error: ${toErrorMessage(error, '工具执行失败')}`
              }
            } else {
              const approval = await requestToolApproval({
                toolName: call.name,
                arguments: call.arguments,
              })
              if (!approval.approved) {
                result = approval.timedOut
                  ? 'Error: 工具调用授权超时，请在弹出的「工具调用授权」窗口中点击允许'
                  : 'Error: 用户拒绝了工具调用'
              } else {
                if (!runtime.autonomousMode || !isDeleteTool(call.name)) {
                  grantToolApprovalScope(options.sessionApprovalScopeKey)
                }
                try {
                  result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
                } catch (error) {
                  result = `Error: ${toErrorMessage(error, '工具执行失败')}`
                }
              }
            }
          } else if (!permission.allowed) {
            result = `Error: ${permission.reason}`
          } else {
            try {
              result = await executeToolCall(call.name, call.arguments, runtime.toolContext)
            } catch (error) {
              result = `Error: ${toErrorMessage(error, '工具执行失败')}`
            }
          }

          options.chatMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: result,
          })

          const shortToolName = call.name.startsWith('mcp__')
            ? (call.name.split('__').pop() ?? call.name)
            : call.name
          const displayLimit = LIST_TOOL_SHORT_NAMES.has(shortToolName)
            ? LIST_TOOL_RESULT_DISPLAY_LIMIT
            : TOOL_RESULT_DISPLAY_LIMIT
          const snippet =
            result.length > displayLimit ? `${result.slice(0, displayLimit)}…` : result
          stream.emitToolUpdate({
            toolCallId: call.id,
            name: call.name,
            arguments: call.arguments?.trim() || undefined,
            result: snippet,
            status: result.startsWith('Error:') ? 'failed' : 'done',
          })
        }

        round += 1
        if (round >= runtime.sessionRoundLimit) {
          hitToolRoundLimit = true
        }
        continue
      }

      stream.buffers.clearThinking()
      stream.persistBlocks(true)
      await streamPlainCompletion({
        sessionId: options.sessionId,
        assistantMessageId: options.assistantMessageId,
        modelId: options.modelId,
        providerConfig: options.providerConfig,
        model: options.model,
        chatMessages: options.chatMessages,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        signal: options.signal,
        onText: stream.appendText,
        onThinking: stream.appendThinking,
        onUsage: options.onUsage,
      })
      break
    }

    if (hitToolRoundLimit) {
      stream.appendText(
        `\n\n⚠️ 已达到工具调用轮次上限（${runtime.sessionRoundLimit} 轮），已停止继续调用工具。可在智能体设置中调高「会话轮次上限」。`,
      )
    }
  } catch (toolError) {
    if (toolError instanceof ProviderError) {
      stream.buffers.clearThinking()
      stream.persistBlocks(true)
      await streamPlainCompletion({
        sessionId: options.sessionId,
        assistantMessageId: options.assistantMessageId,
        modelId: options.modelId,
        providerConfig: options.providerConfig,
        model: options.model,
        chatMessages: options.chatMessages,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        signal: options.signal,
        onText: stream.appendText,
        onThinking: stream.appendThinking,
        onUsage: options.onUsage,
      })
    } else {
      throw toolError
    }
  }
}
