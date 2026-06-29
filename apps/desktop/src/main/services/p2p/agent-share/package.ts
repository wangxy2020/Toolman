import {
  listAssistants,
  restoreAssistantIfDeleted,
  resolveGroupMirrorImportAssistantId,
  updateAssistant,
  createAssistant,
} from '../../assistant.service'
import { getDefaultWorkspace } from '../../workspace.service'
import {
  AgentPackageSchema,
  P2pAgentExportPackageInputSchema,
  P2pAgentImportPackageInputSchema,
  type AgentPackage,
  type Assistant,
} from '@toolman/shared'
import { normalizeAssistantModelId } from './model'

function getAssistantInWorkspace(assistantId: string, workspaceId: string): Assistant | null {
  const assistants = listAssistants({ workspaceId, pinnedOnly: false })
  return assistants.find((item) => item.id === assistantId) ?? null
}

export function buildAgentPackageFromAssistant(assistant: Assistant): AgentPackage {
  const {
    kbIds,
    mcpServerIds,
    skillIds,
    toolStates,
    ...restParameters
  } = assistant.parameters

  const toolIds = [
    ...(skillIds ?? []),
    ...Object.entries(toolStates ?? {})
      .filter(([, enabled]) => enabled)
      .map(([toolId]) => toolId),
  ]

  return AgentPackageSchema.parse({
    version: 1,
    exportedAt: Date.now(),
    assistant: {
      name: assistant.name,
      systemPrompt: assistant.systemPrompt,
      modelId: assistant.modelId,
      parameters: restParameters,
      mcpServers: mcpServerIds ?? [],
      toolIds: [...new Set(toolIds)],
      knowledgeRefs: kbIds ?? [],
    },
    workflow: null,
  })
}

function packageToAssistantParameters(pkg: AgentPackage['assistant']) {
  const mcpServerIds = pkg.mcpServers.filter((item): item is string => typeof item === 'string')
  return {
    ...(pkg.parameters ?? {}),
    ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
    ...(pkg.toolIds.length > 0 ? { skillIds: pkg.toolIds } : {}),
    ...(pkg.knowledgeRefs.length > 0 ? { kbIds: pkg.knowledgeRefs } : {}),
  }
}

export function importAgentPackageToWorkspace(
  targetWorkspaceId: string,
  packageJson: string,
  existingAssistantId?: string,
): { assistantId: string } {
  const parsed = AgentPackageSchema.parse(JSON.parse(packageJson))
  const parameters = packageToAssistantParameters(parsed.assistant)
  const mirrorTargetId = resolveGroupMirrorImportAssistantId(existingAssistantId)

  if (mirrorTargetId) {
    restoreAssistantIfDeleted(mirrorTargetId)
    const updated = updateAssistant({
      id: mirrorTargetId,
      name: parsed.assistant.name,
      systemPrompt: parsed.assistant.systemPrompt,
      modelId: normalizeAssistantModelId(parsed.assistant.modelId),
      parameters,
    })
    if (updated) {
      return { assistantId: updated.id }
    }
  }

  const created = createAssistant({
    workspaceId: targetWorkspaceId,
    name: parsed.assistant.name,
    systemPrompt: parsed.assistant.systemPrompt,
    modelId: normalizeAssistantModelId(parsed.assistant.modelId),
    parameters,
    isPinned: false,
  })

  return { assistantId: created.id }
}

export function exportP2pAgentPackage(rawInput: unknown): {
  package: AgentPackage
  packageJson: string
} {
  const input = P2pAgentExportPackageInputSchema.parse(rawInput)
  const defaultWorkspace = getDefaultWorkspace()
  if (!defaultWorkspace) {
    throw new Error('工作区未就绪')
  }

  const assistant = getAssistantInWorkspace(input.assistantId, defaultWorkspace.id)
  if (!assistant) {
    throw new Error('智能体不存在')
  }

  const agentPackage = buildAgentPackageFromAssistant(assistant)
  return {
    package: agentPackage,
    packageJson: JSON.stringify(agentPackage),
  }
}

export function importP2pAgentPackage(rawInput: unknown): {
  assistantId: string
} {
  const input = P2pAgentImportPackageInputSchema.parse(rawInput)
  const { assistantId } = importAgentPackageToWorkspace(input.workspaceId, input.packageJson)
  return { assistantId }
}
