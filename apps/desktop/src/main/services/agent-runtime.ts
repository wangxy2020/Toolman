import {
  contentBlocksHaveAttachments,
  getDefaultSkillIds,
  getDefaultMcpServerIds,
  isDefaultEnabledMcpServer,
  resolveMcpServerIdsForSkills,
  shouldEnableToolsWithAttachments,
  type ContentBlock,
} from '@toolman/shared'

import { resolveEffectivePermissionMode } from './agent-runtime.service'
import { type PermissionMode } from './permission.service'
import { filterEnabledMcpServerIds } from './mcp-server-config.service'
import { filterEnabledSkillIds } from './skill.service'
import { type ToolExecutionContext } from './tool-executor.service'
import { getAssistantRow } from './assistant.service'
import { getWorkspace } from './workspace.service'
import { parseAssistantParametersJson } from './task-runtime/resolve-models'

export function resolveRuntimeMcpServerIds(skillIds: string[], mcpServerIds: string[]): string[] {
  return filterEnabledMcpServerIds(resolveMcpServerIdsForSkills(skillIds, mcpServerIds))
}

export function resolveAssistantWorkingDirectory(
  assistant: ReturnType<typeof getAssistantRow>,
  workspaceId?: string,
): string | undefined {
  const params = assistant ? parseAssistantParametersJson(assistant.parametersJson) : parseAssistantParametersJson(null)
  const configured = params.workingDirectory
  if (configured?.trim()) return configured.trim()

  if (workspaceId) {
    const workspace = getWorkspace({ id: workspaceId })
    const folderPath = workspace?.settings.folderPath
    if (typeof folderPath === 'string' && folderPath.trim()) return folderPath.trim()
  }

  return undefined
}

export function parseAssistantRuntime(
  assistant: ReturnType<typeof getAssistantRow>,
  workspaceId?: string,
  extra?: { skipDefaultIntegrations?: boolean },
) {
  const params = assistant ? parseAssistantParametersJson(assistant.parametersJson) : parseAssistantParametersJson(null)
  const skipDefaultIntegrations =
    extra?.skipDefaultIntegrations === true || Boolean(params.p2pGroupProxy)
  const permissionMode = (params.permissionMode as PermissionMode | undefined) ?? 'normal'
  const autonomousMode = Boolean(params.autonomousMode)
  const workingDirectory = resolveAssistantWorkingDirectory(assistant, workspaceId)
  const skillIds = filterEnabledSkillIds(
    skipDefaultIntegrations
      ? (params.skillIds ?? [])
      : (params.skillIds ?? getDefaultSkillIds()),
  )
  const baseMcpServerIds = skipDefaultIntegrations
    ? (params.mcpServerIds ?? [])
    : (params.mcpServerIds ?? getDefaultMcpServerIds())
  return {
    permissionMode,
    autonomousMode,
    effectivePermissionMode: resolveEffectivePermissionMode(permissionMode, autonomousMode),
    toolStates: params.toolStates ?? {},
    mcpServerIds: resolveRuntimeMcpServerIds(skillIds, baseMcpServerIds),
    skillIds,
    sessionRoundLimit: params.sessionRoundLimit ?? 100,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    assistantId: assistant?.id,
    workspaceId,
    toolContext: {
      workingDirectory,
      environmentVariables: params.environmentVariables,
      workspaceId,
      assistantId: assistant?.id,
    } as ToolExecutionContext,
  }
}

/** Group-member relay: simple text must not wait on default MCP connect / tool schemas. */
export function relayGenerationMcpServerIds(
  mcpServerIds: string[],
  userContentBlocks: ContentBlock[],
): string[] {
  if (contentBlocksHaveAttachments(userContentBlocks)) return mcpServerIds
  return mcpServerIds.filter((id) => !isDefaultEnabledMcpServer(id))
}

export function shouldEnableTools(
  options: { enableTools?: boolean } | undefined,
  assistant: ReturnType<typeof getAssistantRow>,
  mcpServerIds?: string[],
  userContentBlocks?: ContentBlock[],
): boolean {
  if (options?.enableTools === false) return false
  if (options?.enableTools === true) return true
  if (!assistant) return false
  const runtime = parseAssistantRuntime(assistant)
  const servers = mcpServerIds ?? runtime.mcpServerIds
  return shouldEnableToolsWithAttachments(servers, userContentBlocks ?? [])
}

export function deriveSessionTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 24) return cleaned
  return `${cleaned.slice(0, 24)}…`
}
