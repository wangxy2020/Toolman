export const PROJECT_MANAGEMENT_ASSISTANT_NAME = '项目管理'

/**
 * Topic titles keyed by PM sidebar tab.
 * Key order matches `CONFIGURABLE_SIDEBAR_MENU_KEYS` default (项目管理分栏菜单).
 */
export const PROJECT_MANAGEMENT_AGENT_SESSION_TITLES = {
  all_projects: '工作台',
  urgent_tasks: '待办',
  operations_management: '运营管理',
  contract_risk_management: '合约风控',
  key_projects: '综合管理',
  progress_management: '计划管理',
  cost_management: '成本管理',
  resource_management: '资源管理',
  security_management: '安全质量',
  quality_management: '测量试验',
  archive_management: '档案管理',
} as const

export type ProjectManagementAgentTab = keyof typeof PROJECT_MANAGEMENT_AGENT_SESSION_TITLES

export const PROJECT_MANAGEMENT_AGENT_TABS = Object.keys(
  PROJECT_MANAGEMENT_AGENT_SESSION_TITLES,
) as ProjectManagementAgentTab[]

export const PROJECT_MANAGEMENT_SESSION_METADATA_KEY = 'toolmanProjectManagement'

export type ProjectManagementSessionMetadata = {
  tab: ProjectManagementAgentTab
  dataSource?: 'mock' | 'sqlite' | 'epc'
}

export type ProjectManagementSessionCandidate = {
  id: string
  assistantId: string | null
  title: string
  metadata: Record<string, unknown>
  messageCount: number
  lastMessageAt: number | null
  updatedAt: number
}

export function isProjectManagementAgentTab(tab: string): tab is ProjectManagementAgentTab {
  return (PROJECT_MANAGEMENT_AGENT_TABS as readonly string[]).includes(tab)
}

export function parseProjectManagementSessionMetadata(
  metadata: Record<string, unknown>,
): ProjectManagementSessionMetadata | null {
  const raw = metadata[PROJECT_MANAGEMENT_SESSION_METADATA_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const tab = (raw as { tab?: unknown }).tab
  if (typeof tab !== 'string' || !isProjectManagementAgentTab(tab)) return null

  const dataSource = (raw as { dataSource?: unknown }).dataSource
  return {
    tab,
    dataSource:
      dataSource === 'epc' || dataSource === 'mock' || dataSource === 'sqlite'
        ? dataSource
        : undefined,
  }
}

/** Infer PM tab from session title when metadata is missing (legacy sessions). */
export function resolveProjectManagementTabFromSessionTitle(
  title: string,
): ProjectManagementAgentTab | null {
  const normalized = title.trim()
  if (!normalized) return null
  for (const tab of PROJECT_MANAGEMENT_AGENT_TABS) {
    if (PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab] === normalized) return tab
  }
  return null
}

export function resolveProjectManagementTabFromSession(session: {
  title: string
  metadata: Record<string, unknown>
}): ProjectManagementAgentTab | null {
  return (
    parseProjectManagementSessionMetadata(session.metadata)?.tab ??
    resolveProjectManagementTabFromSessionTitle(session.title)
  )
}

export function buildProjectManagementSessionMetadata(
  tab: ProjectManagementAgentTab,
): Record<string, unknown> {
  return {
    [PROJECT_MANAGEMENT_SESSION_METADATA_KEY]: {
      tab,
      dataSource: 'sqlite',
    } satisfies ProjectManagementSessionMetadata,
  }
}

export function listProjectManagementAssistantSessions(
  sessions: ProjectManagementSessionCandidate[],
  assistantId: string,
): ProjectManagementSessionCandidate[] {
  return sessions.filter((session) => session.assistantId === assistantId)
}

/**
 * Sort PM agent topics to match a sidebar menu key order.
 * Unknown / non-tab sessions sink to the end (then by recency).
 */
export function sortProjectManagementSessionsByMenuOrder<
  T extends {
    title: string
    metadata: Record<string, unknown>
    lastMessageAt?: number | null
    updatedAt?: number
  },
>(sessions: readonly T[], menuOrder: readonly string[]): T[] {
  const rank = new Map(menuOrder.map((tab, index) => [tab, index]))
  return [...sessions].sort((left, right) => {
    const leftTab = resolveProjectManagementTabFromSession(left)
    const rightTab = resolveProjectManagementTabFromSession(right)
    const leftRank = leftTab != null ? (rank.get(leftTab) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    const rightRank = rightTab != null ? (rank.get(rightTab) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    const rightActivity = right.lastMessageAt ?? right.updatedAt ?? 0
    const leftActivity = left.lastMessageAt ?? left.updatedAt ?? 0
    return rightActivity - leftActivity
  })
}

export function pickBestProjectManagementSession(
  candidates: ProjectManagementSessionCandidate[],
): ProjectManagementSessionCandidate | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((left, right) => {
    const messageDelta = (right.messageCount ?? 0) - (left.messageCount ?? 0)
    if (messageDelta !== 0) return messageDelta
    const rightActivity = right.lastMessageAt ?? right.updatedAt
    const leftActivity = left.lastMessageAt ?? left.updatedAt
    return rightActivity - leftActivity
  })[0]!
}

export function resolveProjectManagementSessionForTab(
  sessions: ProjectManagementSessionCandidate[],
  assistantId: string,
  tab: ProjectManagementAgentTab,
): ProjectManagementSessionCandidate | null {
  const scoped = listProjectManagementAssistantSessions(sessions, assistantId)
  const expectedTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]

  const byMetadata = scoped.filter((session) => {
    const metadata = parseProjectManagementSessionMetadata(session.metadata)
    return metadata?.tab === tab
  })
  const metadataMatch = pickBestProjectManagementSession(byMetadata)
  if (metadataMatch) return metadataMatch

  const byTitle = scoped.filter((session) => session.title.trim() === expectedTitle)
  return pickBestProjectManagementSession(byTitle)
}

export function needsProjectManagementSessionReconcile(
  session: ProjectManagementSessionCandidate,
  tab: ProjectManagementAgentTab,
): boolean {
  const expectedTitle = PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab]
  const metadata = parseProjectManagementSessionMetadata(session.metadata)
  return session.title.trim() !== expectedTitle || metadata?.tab !== tab
}

export function buildProjectManagementSessionReconcilePatch(
  session: ProjectManagementSessionCandidate,
  tab: ProjectManagementAgentTab,
): { title: string; metadata: Record<string, unknown> } {
  return {
    title: PROJECT_MANAGEMENT_AGENT_SESSION_TITLES[tab],
    metadata: projectManagementSessionMetadataPatch(session.metadata, tab),
  }
}

export function projectManagementSessionMetadataPatch(
  metadata: Record<string, unknown>,
  tab: ProjectManagementAgentTab,
): Record<string, unknown> {
  return {
    ...metadata,
    ...buildProjectManagementSessionMetadata(tab),
  }
}
