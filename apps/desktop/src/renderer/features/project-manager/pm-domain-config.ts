import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

export const PM_DATABASE_DOMAINS: ConfigurableSidebarMenuKey[] = [
  'all_projects',
  'urgent_tasks',
  'cost_management',
  'progress_management',
  'key_projects',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
  'contract_risk_management',
  'operations_management',
]

export const PM_FILES_DOMAINS: ConfigurableSidebarMenuKey[] = [
  'progress_management',
  'resource_management',
  'cost_management',
]

/** Time entries remain available via API; toolbar entry removed. */
export const PM_TIME_ENTRIES_DOMAINS: ConfigurableSidebarMenuKey[] = [
  'all_projects',
  'cost_management',
  'resource_management',
]

export const PM_VERTICAL_STATS_DOMAINS: ConfigurableSidebarMenuKey[] = [
  'resource_management',
  'security_management',
  'quality_management',
  'contract_risk_management',
  'operations_management',
]

export function isPmDatabaseDomain(
  domain: ConfigurableSidebarMenuKey,
): domain is ConfigurableSidebarMenuKey {
  return PM_DATABASE_DOMAINS.includes(domain)
}

export function isPmFilesDomain(
  domain: ConfigurableSidebarMenuKey,
): domain is ConfigurableSidebarMenuKey {
  return PM_FILES_DOMAINS.includes(domain)
}

export function isPmTimeEntriesDomain(
  domain: ConfigurableSidebarMenuKey,
): domain is ConfigurableSidebarMenuKey {
  return PM_TIME_ENTRIES_DOMAINS.includes(domain)
}

export function isPmVerticalStatsDomain(
  domain: ConfigurableSidebarMenuKey,
): domain is ConfigurableSidebarMenuKey {
  return PM_VERTICAL_STATS_DOMAINS.includes(domain)
}

export function resolvePmDatabaseListDomain(
  domain: ConfigurableSidebarMenuKey,
): import('@toolman/shared').PmDomain | undefined {
  if (domain === 'all_projects' || domain === 'urgent_tasks') {
    return undefined
  }
  return domain
}
