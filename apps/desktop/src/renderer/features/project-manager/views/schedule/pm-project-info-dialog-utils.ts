/** Pure types and helpers for `ProjectInfoDialog` (no React) — facade. */

export {
  PM_COST_ESTIMATE_TYPES,
  PM_COST_ESTIMATE_TYPE_SET,
  PROJECT_TYPE_OPTIONS,
  parseProjectType,
  resolveDomainTabId,
  resolveDomainTabKind,
  resolveInfoDomain,
  type CreateDefaults,
  type CreateProps,
  type DomainTabKind,
  type EditProps,
  type InfoTab,
  type PmPlanCalendar,
  type PmProjectType,
  type ProjectInfoDraft,
  type ProjectInfoVariant,
  type Props,
  type WorkspaceCostProps,
  type WorkspaceFeaturesProps,
  type WorkspaceResourceProps,
} from './pm-project-info-dialog-utils-types'

export {
  buildCostCurrencyMetadata,
  buildMetadata,
  emptyDraft,
  parseOptionalNumber,
  toDraft,
} from './pm-project-info-dialog-utils-draft'

export {
  computeCostStats,
  computeResourceStats,
  computeScheduleBounds,
  formatDateTime,
  formatMoney,
} from './pm-project-info-dialog-utils-stats'
