import type { ContentBlock } from '@toolman/shared'

import { getAgentTask } from './store'
import { resolveTaskOutputFileLinks } from './task-output-files'

type TaskReflectionMetadata = {
  verdict?: string
  reason?: string
  summary?: string
}

function readLastReflection(task: ReturnType<typeof getAgentTask>): TaskReflectionMetadata | undefined {
  const raw = task?.metadata?.lastReflection
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  return raw as TaskReflectionMetadata
}

export function readTaskFailureReason(task: NonNullable<ReturnType<typeof getAgentTask>>): string | undefined {
  return (
    (typeof task.metadata.orchestratorFailureReason === 'string'
      ? task.metadata.orchestratorFailureReason
      : undefined) ||
    (typeof task.metadata.stageGateFailureReason === 'string'
      ? task.metadata.stageGateFailureReason
      : undefined) ||
    (typeof task.metadata.executorFailureReason === 'string'
      ? task.metadata.executorFailureReason
      : undefined) ||
    readLastReflection(task)?.reason?.trim()
  )
}

function isUnreliableReflectionSummary(summary: string): boolean {
  return /未包含|任务图标|task icon/i.test(summary)
}

export function normalizeTaskAssistantText(text: string, resolvedPaths: string[]): string {
  let result = text
    .replace(/[`'"]/g, '')
    .replace(/\[([^\]]+\.(?:xlsx?|docx?|csv|pdf|txt|md))\]\([^)]*\)/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (resolvedPaths.length > 0) {
    result = result
      .replace(/(?:保存位置|路径)[：:]\s*\S+/gi, '')
      .trim()
  }

  return result
}

export function buildTaskAssistantReply(task: NonNullable<ReturnType<typeof getAgentTask>>): string {
  const reflection = readLastReflection(task)
  const outputPaths = resolveTaskOutputFileLinks(task)

  if (task.status === 'completed') {
    const summary = reflection?.summary?.trim()
    if (outputPaths.length > 0) {
      if (summary && !isUnreliableReflectionSummary(summary)) {
        return summary
      }
      return '任务已完成，生成的文件见下方链接。'
    }
    return summary || task.notes?.trim() || '任务已完成。'
  }

  if (task.status === 'failed') {
    const reason = readTaskFailureReason(task)
    const summary = reflection?.summary?.trim()

    if (outputPaths.length > 0 && summary) {
      const suffix = reason ? `\n\n⚠️ 任务状态：失败（${reason}）` : ''
      return `${summary}${suffix}`
    }

    return reason ? `任务失败：${reason}` : '任务失败。'
  }

  if (task.status === 'paused') {
    return '任务已暂停。恢复后可继续执行。'
  }

  if (task.status === 'cancelled') {
    return '任务已取消。'
  }

  return `任务当前状态：${task.status}`
}

export function buildTaskAssistantContentBlocks(
  task: NonNullable<ReturnType<typeof getAgentTask>>,
  thinkingText?: string,
): ContentBlock[] {
  const rawText = buildTaskAssistantReply(task)
  const paths = resolveTaskOutputFileLinks(task)
  const text = normalizeTaskAssistantText(rawText, paths)
  const blocks: ContentBlock[] = []

  const trimmedThinking = thinkingText?.trim()
  if (trimmedThinking) {
    blocks.push({ type: 'thinking', text: trimmedThinking })
  }

  blocks.push({ type: 'text', text })

  if (paths.length > 0) {
    blocks.push({
      type: 'local_file_links',
      title: '生成的文件',
      paths,
    })
  }

  return blocks
}
