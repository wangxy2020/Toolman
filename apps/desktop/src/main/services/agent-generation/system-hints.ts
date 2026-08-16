import {
  resolveProjectManagementTabFromSession,
  buildProjectManagementRuntimeHint,
} from '@toolman/shared'
import { parseModelId } from '../provider.service'
import { getProviderRow } from '../provider/crud'
import { getSession } from '../session.service'
import { logStructured } from '../structured-log.service'
import {
  buildPmRuntimeSnapshot,
  buildPmResourceCatalogFallbackSnapshot,
} from '../project-management/pm-runtime-snapshot.service'
import { searchKnowledgeForChat } from '../knowledge-document.service'
import type { BuildRuntimeSystemHintsOptions } from './types'
import { appendAttachmentSystemHints } from './system-hints-attachments'
import { appendRuntimeContextHints } from './system-hints-context'

/** Prevent stale assistant self-introductions after the user switches models mid-session. */
export function buildRuntimeModelIdentityHint(modelId: string): string | null {
  try {
    const { providerId, model } = parseModelId(modelId)
    const providerName = getProviderRow(providerId)?.name?.trim()
    const label = providerName ? `${model}（${providerName}）` : model
    return [
      '## 当前推理模型',
      `本条回复由 ${label} 生成。`,
      '用户询问你的模型名称、开发者或版本时，必须按**当前推理模型**如实回答，不要复述对话历史中其他模型留下的自我介绍。',
    ].join('\n')
  } catch {
    return null
  }
}

export async function buildRuntimeSystemHints(
  options: BuildRuntimeSystemHintsOptions,
): Promise<{ hints: string[]; kbResults: Awaited<ReturnType<typeof searchKnowledgeForChat>> }> {
  const hints: string[] = []

  if (options.modelId?.trim()) {
    const identityHint = buildRuntimeModelIdentityHint(options.modelId)
    if (identityHint) hints.push(identityHint)
  }

  const session = options.sessionId ? getSession({ id: options.sessionId }) : null
  if (session) {
    const tab = resolveProjectManagementTabFromSession(session)
    if (tab) {
      let snapshot = null
      try {
        if (session.workspaceId) {
          snapshot = buildPmRuntimeSnapshot(session.workspaceId, tab)
        }
      } catch (error) {
        logStructured('pm', 'warn', 'runtime snapshot failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        if (
          session.workspaceId &&
          (tab === 'resource_management' || tab === 'progress_management')
        ) {
          try {
            snapshot = buildPmResourceCatalogFallbackSnapshot(session.workspaceId, tab)
          } catch (fallbackError) {
            logStructured('pm', 'warn', 'resource catalog fallback failed', {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            })
            snapshot = null
          }
        } else {
          snapshot = null
        }
      }
      hints.push(buildProjectManagementRuntimeHint(tab, snapshot))
    }
  }

  const hasInlineAttachment = Boolean(
    options.userContentBlocks?.some(
      (block) =>
        (block.type === 'file' && (block.content?.trim() || (block.visionPages && block.visionPages.length > 0))) ||
        (block.type === 'image' && block.blobHash?.trim()),
    ),
  )

  appendAttachmentSystemHints(hints, options)

  const kbResults = await appendRuntimeContextHints(hints, options, session, hasInlineAttachment)

  return {
    hints: hints.filter((item) => item.trim().length > 0),
    kbResults,
  }
}
