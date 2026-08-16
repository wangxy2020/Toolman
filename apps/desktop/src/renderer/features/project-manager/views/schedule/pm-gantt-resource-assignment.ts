/** Task ↔ resource-catalog assignment(s) stored on `PmWorkItem.metadata`. */

export {
  EMPTY_TASK_RESOURCE_ASSIGNMENT,
  isEmptyAssignment,
  parseResourceColumnId,
  RESOURCE_COLUMN_TYPE_ORDER,
  resourceMatchKey,
  TASK_RESOURCE_ASSIGNMENT_KEY,
  TASK_RESOURCE_ASSIGNMENTS_KEY,
  type ResourceColumnField,
  type TaskResourceAssignment,
} from './pm-gantt-resource-assignment-types'

export {
  findAssignmentIndexForResource,
  orderResourcesForGanttColumns,
  upsertResourceColumnQuantity,
} from './pm-gantt-resource-assignment-columns'

export {
  findCatalogRowForAssignment,
  hydrateTaskResourceAssignmentsAgainstCatalog,
  isAssignmentInCatalog,
  patchTaskResourceAssignmentMetadata,
  readTaskResourceAssignmentAt,
  readTaskResourceAssignments,
  replaceTaskResourceAssignmentsMetadata,
  resolveAssignmentAgainstCatalog,
} from './pm-gantt-resource-assignment-metadata'

export {
  catalogRowsForType,
  catalogTypesInUse,
  countResourceAssignmentsForTypeFilter,
  isAssignedResource,
  moveTaskResourceAssignment,
  orderAssignmentsByResourceCatalog,
  readResourceAssignmentAtFilteredSlot,
  resolveResourceAssignSourceIndex,
} from './pm-gantt-resource-assignment-catalog'

export {
  formatResourceAssignmentInput,
  formatResourceAssignmentsInput,
  parseResourceAssignmentInput,
  parseResourceAssignmentsInput,
} from './pm-gantt-resource-assignment-format'
