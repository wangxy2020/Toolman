import { useCallback, useMemo } from 'react'
import type { Assistant, ContentBlock } from '@toolman/shared'
import { getBlocksText } from '../chat/message-utils'
import type { useChat } from '../chat/useChat'
import { tryRunToolmanEpcWorkflow } from '../project-management-epc/run-toolman-epc-workflow'

type ChatApi = ReturnType<typeof useChat>

function splitContentBlocks(contentBlocks: ContentBlock[]) {
  const attachmentBlocks = contentBlocks.filter((block) => block.type !== 'text')
  const text = getBlocksText(contentBlocks.filter((block) => block.type === 'text'))
  return { attachmentBlocks, text }
}

export function useProjectManagementEpcSend(
  chat: ChatApi,
  assistant: Assistant | null,
  enabled: boolean,
) {
  const workspaceRoot = useMemo(() => {
    const configured = assistant?.parameters.workingDirectory?.trim()
    return configured || null
  }, [assistant?.parameters.workingDirectory])

  return useCallback(
    async (contentBlocks: ContentBlock[]) => {
      if (!enabled || !assistant) {
        await chat.sendMessage(contentBlocks)
        return
      }

      const { attachmentBlocks, text } = splitContentBlocks(contentBlocks)
      const workflow = await tryRunToolmanEpcWorkflow({
        text,
        workspaceRoot,
        attachmentBlocks,
      })

      if (workflow.handled) {
        await chat.sendMessage(workflow.contentBlocks)
        return
      }

      await chat.sendMessage(contentBlocks)
    },
    [assistant, chat, enabled, workspaceRoot],
  )
}
