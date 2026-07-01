export const PROJECT_MANAGEMENT_ASSISTANT_NAME = '项目管理'

export const PROJECT_MANAGEMENT_AGENT_SESSION_TITLES = {
  cost_management: '成本管理',
  progress_management: '计划管理',
} as const

export type ProjectManagementAgentTab = keyof typeof PROJECT_MANAGEMENT_AGENT_SESSION_TITLES

export const PROJECT_MANAGEMENT_SESSION_METADATA_KEY = 'toolmanProjectManagement'

export type ProjectManagementSessionMetadata = {
  tab: ProjectManagementAgentTab
  dataSource?: 'mock' | 'epc'
}

export function isProjectManagementAgentTab(tab: string): tab is ProjectManagementAgentTab {
  return tab === 'cost_management' || tab === 'progress_management'
}

export function parseProjectManagementSessionMetadata(
  metadata: Record<string, unknown>,
): ProjectManagementSessionMetadata | null {
  const raw = metadata[PROJECT_MANAGEMENT_SESSION_METADATA_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const tab = (raw as { tab?: unknown }).tab
  if (tab !== 'cost_management' && tab !== 'progress_management') return null

  const dataSource = (raw as { dataSource?: unknown }).dataSource
  return {
    tab,
    dataSource: dataSource === 'epc' || dataSource === 'mock' ? dataSource : undefined,
  }
}

export function buildProjectManagementSessionMetadata(
  tab: ProjectManagementAgentTab,
): Record<string, unknown> {
  return {
    [PROJECT_MANAGEMENT_SESSION_METADATA_KEY]: {
      tab,
      dataSource: 'mock',
    } satisfies ProjectManagementSessionMetadata,
  }
}
