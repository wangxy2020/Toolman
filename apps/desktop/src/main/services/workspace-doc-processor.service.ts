import { listKnowledgeBases } from './knowledge.service'
import { resolveDocProcessorConfig } from './knowledge-embed.service'
import { resolveDefaultDocProcessorProviderId } from './provider.service'

const SYSTEM_KB_NAMES = new Set(['默认文件夹', '默认网络文件夹'])

export interface WorkspaceDocProcessorContext {
  enhanced: boolean
  ocrKbId?: string
  providerId: string | null
}

export function resolveWorkspaceDocProcessorContext(
  workspaceId: string,
): WorkspaceDocProcessorContext {
  const items = listKnowledgeBases({ workspaceId })
  const ordered = [
    ...items.filter((kb) => SYSTEM_KB_NAMES.has(kb.name)),
    ...items.filter((kb) => !SYSTEM_KB_NAMES.has(kb.name)),
  ]

  for (const kb of ordered) {
    const docProcessor = resolveDocProcessorConfig(workspaceId, kb.id)
    if (docProcessor.enhanced) {
      return {
        enhanced: true,
        ocrKbId: kb.id,
        providerId:
          kb.embedConfig.docProcessorProviderId ??
          resolveDefaultDocProcessorProviderId(workspaceId),
      }
    }
  }

  const defaultId = resolveDefaultDocProcessorProviderId(workspaceId)
  return {
    enhanced: Boolean(defaultId),
    providerId: defaultId,
  }
}
