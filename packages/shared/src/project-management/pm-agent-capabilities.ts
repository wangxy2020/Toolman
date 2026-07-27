import type { ProjectManagementAgentTab } from './agent-link.js'
import { parsePmCostCatalogPatchesFromText } from './pm-cost-catalog-agent.js'
import { parsePmCostPlanFromText } from './pm-cost-apply.js'
import { parsePmFullPlanFromText, parsePmScheduleSuggestionsFromText } from './pm-plan-apply.js'
import { parsePmResourceCatalogPatchesFromText } from './pm-resource-catalog-agent.js'
import { parsePmResourcePlanFromText } from './pm-resource-apply.js'

/**
 * Declarative capabilities per PM agent tab.
 * New domains should extend this map instead of hard-coding `activeTab ===` in the panel.
 */
export type PmAgentApplyKind =
  | 'plan'
  | 'schedule'
  | 'resourcePlan'
  | 'resourceCatalog'
  | 'costPlan'
  | 'costCatalog'

export type PmAgentCapability = {
  /** Quick phrases / slash expansions for this tab. */
  phrases: 'none' | 'plan' | 'cost' | 'execution' | 'resource'
  /** Confirm-and-apply footers shown on the last assistant message. */
  apply: ReadonlyArray<PmAgentApplyKind>
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
  contract_risk_management: { phrases: 'none', apply: [], kickoff: false },
  operations_management: { phrases: 'none', apply: [], kickoff: false },
}

export function getPmAgentCapability(tab: ProjectManagementAgentTab): PmAgentCapability {
  return PM_AGENT_CAPABILITIES[tab]
}

/**
 * Pick a single apply-footer family for the last assistant message.
 * Progress / resource / cost payloads must not stack as multiple 确定/放弃 pairs.
 */
export function resolvePmAgentApplyKindsForMessage(
  text: string,
  allowed: readonly PmAgentApplyKind[],
): PmAgentApplyKind[] {
  if (!text.trim() || allowed.length === 0) return []
  const allowedSet = new Set(allowed)

  const hasWbs = parsePmFullPlanFromText(text).wbs.length > 0
  const hasSchedule = parsePmScheduleSuggestionsFromText(text).length > 0
  const hasCostPlan = parsePmCostPlanFromText(text).costPlan.length > 0
  const hasResourcePlan = parsePmResourcePlanFromText(text).resourcePlan.length > 0
  const hasCostCatalog = parsePmCostCatalogPatchesFromText(text).patches.length > 0
  const hasResourceCatalog = parsePmResourceCatalogPatchesFromText(text).patches.length > 0

  if ((hasWbs || hasSchedule) && (allowedSet.has('plan') || allowedSet.has('schedule'))) {
    return allowed.filter((kind) => kind === 'plan' || kind === 'schedule')
  }
  if (hasCostPlan && allowedSet.has('costPlan')) {
    return ['costPlan']
  }
  if (hasResourcePlan && allowedSet.has('resourcePlan')) {
    return ['resourcePlan']
  }
  if (hasCostCatalog && allowedSet.has('costCatalog')) {
    return ['costCatalog']
  }
  if (hasResourceCatalog && allowedSet.has('resourceCatalog')) {
    return ['resourceCatalog']
  }
  return []
}
