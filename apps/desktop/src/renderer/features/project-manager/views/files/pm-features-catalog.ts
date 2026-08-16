/** Practice (实务) catalog stored on `PmProject.metadata.featureCatalog`.
 * Workspace-wide「全部项目」catalog is stored in localStorage per workspace.
 */

export {
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  PM_FEATURE_COST_PRIMARY_TYPES,
  PM_FEATURE_SCHEDULE_TYPES,
  PM_FEATURE_TYPES,
  featureTypeMenuRank,
  isPmFeatureCostPrimaryType,
  isPmFeatureType,
  isScheduleFeatureType,
  type PmFeatureCostPrimaryType,
  type PmFeatureRow,
  type PmFeatureType,
  type PmFeatureViewFilter,
} from './pm-features-catalog-types'

export {
  createDefaultFeatureCatalog,
  createEmptyFeatureRow,
  featureRowDepth,
  fingerprintFeatureCatalog,
  reindexFeatureRows,
} from './pm-features-catalog-rows'

export {
  isLiveNodeFeatureRow,
  isLiveProcurementFeatureRow,
  persistFeatureCatalogRows,
  pruneLegacyScheduleFeaturePlaceholders,
  stripLiveCostFeatureRows,
  stripLiveFeatureRows,
  stripLiveNodeFeatureRows,
  stripLiveProcurementFeatureRows,
  stripScheduleFeatureRows,
} from './pm-features-catalog-strip'

export {
  mergeSharedIntoProjectFeatureCatalog,
  readSharedFeatureCatalog,
  readSharedFeatureLastSavedAt,
  readSharedFeatureSaveHistory,
  readSharedFeatureSaveMeta,
  readSharedFeatureVersion,
  recordSharedFeatureSaveMeta,
  removeSharedFeatureSaveHistoryEntry,
  resolveProjectFeatureCatalog,
  toFeatureCatalogSnapshot,
  writeSharedFeatureCatalog,
  writeSharedFeatureSaveMeta,
} from './pm-features-catalog-storage'
