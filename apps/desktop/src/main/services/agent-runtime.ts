import {
  getDefaultSkillIds,
  getDefaultMcpServerIds,
  resolveMcpServerIdsForSkills,
  AssistantParametersSchema,
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

export function resolveRuntimeMcpServerIds(skillIds: string[], mcpServerIds: string[]): string[] {
  return filterEnabledMcpServerIds(resolveMcpServerIdsForSkills(skillIds, mcpServerIds))
}

function resolveAssistantWorkingDirectory(
  assistant: ReturnType<typeof getAssistantRow>,
  workspaceId?: string,
): string | undefined {
  const params = assistant ? (JSON.parse(assistant.parametersJson) as Record<string, unknown>) : {}
  const configured = params.workingDirectory as string | undefined
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
) {
  const params = assistant ? (JSON.parse(assistant.parametersJson) as Record<string, unknown>) : {}
  const isGroupProxyShell = Boolean(params.p2pGroupProxy)
  const permissionMode = (params.permissionMode as PermissionMode | undefined) ?? 'normal'
  const autonomousMode = Boolean(params.autonomousMode)
  const workingDirectory = resolveAssistantWorkingDirectory(assistant, workspaceId)
  const skillIds = filterEnabledSkillIds(
    isGroupProxyShell
      ? ((params.skillIds as string[] | undefined) ?? [])
      : ((params.skillIds as string[] | undefined) ?? getDefaultSkillIds()),
  )
  const baseMcpServerIds = isGroupProxyShell
    ? ((params.mcpServerIds as string[] | undefined) ?? [])
    : ((params.mcpServerIds as string[] | undefined) ?? getDefaultMcpServerIds())
  return {
    permissionMode,
    autonomousMode,
    effectivePermissionMode: resolveEffectivePermissionMode(permissionMode, autonomousMode),
    toolStates: (params.toolStates as Record<string, boolean> | undefined) ?? {},
    mcpServerIds: resolveRuntimeMcpServerIds(skillIds, baseMcpServerIds),
    skillIds,
    sessionRoundLimit:
      AssistantParametersSchema.shape.sessionRoundLimit.parse(params.sessionRoundLimit) ?? 100,
    temperature: params.temperature as number | undefined,
    maxTokens: params.maxTokens as number | undefined,
    assistantId: assistant?.id,
    workspaceId,
    toolContext: {
      workingDirectory,
      environmentVariables: params.environmentVariables as string | undefined,
      workspaceId,
      assistantId: assistant?.id,
    } as ToolExecutionContext,
  }
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
