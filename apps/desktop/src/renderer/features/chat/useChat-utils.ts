import {
  type Assistant,
  type ContentBlock,
  resolveMcpServerIdsForSkills,
  shouldEnableToolsWithAttachments,
} from '@toolman/shared'
import { getDefaultMcpServerIds, getDefaultSkillIds } from './agent-settings-constants'

export function getAssistantSkillIds(assistant?: Assistant | null): string[] {
  if (assistant?.parameters.p2pGroupProxy) return []
  return assistant?.parameters.skillIds ?? getDefaultSkillIds()
}

export function getAssistantMcpServerIds(assistant?: Assistant | null): string[] {
  if (assistant?.parameters.p2pGroupProxy) return []
  const skillIds = getAssistantSkillIds(assistant)
  const baseMcpServerIds = assistant?.parameters.mcpServerIds?.length
    ? assistant.parameters.mcpServerIds
    : getDefaultMcpServerIds()
  return resolveMcpServerIdsForSkills(skillIds, baseMcpServerIds)
}

export function resolveChatEnableTools(
  mcpServerIds: string[],
  _skillIds: string[],
  contentBlocks: ContentBlock[],
  override?: boolean,
): boolean {
  if (override === false) return false
  if (override === true) return true
  return shouldEnableToolsWithAttachments(mcpServerIds, contentBlocks)
}
