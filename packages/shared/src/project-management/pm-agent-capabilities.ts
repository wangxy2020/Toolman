import type { ProjectManagementAgentTab } from './agent-link.js'

/**
 * Declarative capabilities per PM agent tab.
 * New domains should extend this map instead of hard-coding `activeTab ===` in the panel.
 */
export type PmAgentCapability = {
  /** Quick phrases / slash expansions for this tab. */
  phrases: 'none' | 'plan' | 'cost' | 'execution' | 'resource'
  /** Confirm-and-apply footers shown on the last assistant message. */
  apply: ReadonlyArray<
    'plan' | 'schedule' | 'resourcePlan' | 'resourceCatalog' | 'costPlan' | 'costCatalog'
  >
  /** Auto-send project brief after create (plan kickoff). */
  kickoff: boolean
}

export const PM_AGENT_CAPABILITIES: Record<ProjectManagementAgentTab, PmAgentCapability> = {
  all_projects: { phrases: 'execution', apply: [], kickoff: false },
  urgent_tasks: { phrases: 'execution', apply: [], kickoff: false },
  key_projects: { phrases: 'none', apply: [], kickoff: false },
  progress_management: {
    phrases: 'plan',
    /** Plan session confirms WBS/schedule and resource/cost quantities into the Gantt. */
    apply: ['plan', 'schedule', 'resourcePlan', 'resourceCatalog', 'costPlan'],
    kickoff: true,
  },
  cost_management: { phrases: 'cost', apply: ['costPlan', 'costCatalog'], kickoff: false },
  resource_management: {
    phrases: 'resource',
    apply: ['resourceCatalog'],
    kickoff: false,
  },
  security_management: { phrases: 'none', apply: [], kickoff: false },
  quality_management: { phrases: 'none', apply: [], kickoff: false },
  archive_management: { phrases: 'none', apply: [], kickoff: false },
  technical_management: { phrases: 'none', apply: [], kickoff: false },
  contract_risk_management: { phrases: 'none', apply: [], kickoff: false },
  operations_management: { phrases: 'none', apply: [], kickoff: false },
}

export function getPmAgentCapability(tab: ProjectManagementAgentTab): PmAgentCapability {
  return PM_AGENT_CAPABILITIES[tab]
}
