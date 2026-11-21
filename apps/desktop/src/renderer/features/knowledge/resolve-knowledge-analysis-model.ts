import type { KnowledgeBase, Provider } from '@toolman/shared'
import { isModelIdAvailable } from '../chat/model-utils'

/**
 * Resolve the KB analysis model for Q&A / chat-with-files.
 * Returns the configured model only when it is available on a provider.
 * Does not invent a fallback (e.g. first network chat model) — callers should
 * keep the current agent model when this returns null.
 */
export function resolveKnowledgeAnalysisModelId(
  kb: Pick<KnowledgeBase, 'embedConfig'> | null | undefined,
  providers: Provider[],
): string | null {
  const configured = kb?.embedConfig.analysisModelId?.trim() || null
  if (configured && isModelIdAvailable(configured, providers)) {
    return configured
  }
  return null
}
