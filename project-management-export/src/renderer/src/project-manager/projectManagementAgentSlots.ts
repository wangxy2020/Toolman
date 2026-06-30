import type { AgentEntity } from '@renderer/types'

/** 项目管理各模块绑定的智能体槽位（与左侧 Tab 对应，可扩展） */
export type ProjectManagementAgentSlot = 'progress_management' | 'cost_management'

export const PROJECT_MANAGEMENT_AGENT_SLOT_CONFIG: Record<
  ProjectManagementAgentSlot,
  { label: string; defaultAgentName: string }
> = {
  progress_management: {
    label: '计划智能体',
    defaultAgentName: '计划智能体'
  },
  cost_management: {
    label: '成本智能体',
    defaultAgentName: '成本智能体'
  }
}

const STORAGE_KEY = 'cherry-studio:project-management-agent-bindings'

type BindingsMap = Partial<Record<ProjectManagementAgentSlot, string>>

const readBindings = (): BindingsMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as BindingsMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeBindings = (bindings: BindingsMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // quota / private mode
  }
}

export const getBoundAgentId = (slot: ProjectManagementAgentSlot): string | null => {
  const id = readBindings()[slot]
  return typeof id === 'string' && id.length > 0 ? id : null
}

export const setBoundAgentId = (slot: ProjectManagementAgentSlot, agentId: string): void => {
  const bindings = readBindings()
  bindings[slot] = agentId
  writeBindings(bindings)
}

/**
 * 解析槽位应对应的 Agent：
 * 1. 优先按模块默认名称（计划智能体 / 成本智能体）精确匹配
 * 2. 若无同名 Agent，再使用本槽位历史绑定（支持用户自定义名称）
 */
export const resolveAgentIdForSlot = (slot: ProjectManagementAgentSlot, agents: AgentEntity[]): string | null => {
  if (agents.length === 0) {
    return null
  }

  const expectedName = PROJECT_MANAGEMENT_AGENT_SLOT_CONFIG[slot].defaultAgentName
  const byName = agents.find((agent) => agent.name?.trim() === expectedName)
  if (byName) {
    return byName.id
  }

  const boundId = getBoundAgentId(slot)
  if (boundId && agents.some((agent) => agent.id === boundId)) {
    return boundId
  }

  return null
}
