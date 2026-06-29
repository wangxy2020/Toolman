import { AgentPackageSchema } from '@toolman/shared'
import { readAgentShareMetadata } from './metadata'

export const DEFAULT_GROUP_AGENT_MODEL_ID = 'openai/gpt-4o-mini'

export function normalizeAssistantModelId(modelId: string | null | undefined): string {
  const trimmed = modelId?.trim()
  if (!trimmed) return DEFAULT_GROUP_AGENT_MODEL_ID
  const sep = trimmed.indexOf(':')
  if (sep > 0 && sep < trimmed.length - 1) {
    return trimmed
  }
  return DEFAULT_GROUP_AGENT_MODEL_ID
}

export function readSharedAgentModelId(
  metadata: ReturnType<typeof readAgentShareMetadata>,
): string | undefined {
  if (!metadata.packageJson) return undefined
  try {
    const pkg = AgentPackageSchema.parse(JSON.parse(metadata.packageJson))
    return normalizeAssistantModelId(pkg.assistant.modelId)
  } catch {
    return undefined
  }
}
