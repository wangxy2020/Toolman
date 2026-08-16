export {
  PM_FEATURE_VERSION_KEY,
  PM_FEATURE_LAST_SAVED_AT_KEY,
  PM_FEATURE_SAVE_HISTORY_KEY,
  PM_FEATURE_CONTENT_FINGERPRINT_KEY,
  PM_FEATURE_SAVE_HISTORY_MAX,
  normalizeFeatureCatalogSnapshot,
  type PmFeatureCatalogSnapshotRow,
  type PmFeatureSaveRecord,
} from './pm-feature-save-history-types.js'

export {
  readFeatureVersion,
  readMaxFeatureVersion,
  readFeatureLastSavedAt,
  readFeatureContentFingerprint,
  readFeatureSaveHistory,
  readFeatureVersionCatalog,
  buildMetadataForFeatureVersionSwitch,
  buildFeatureSaveMetadata,
  removeFeatureSaveHistoryEntry,
} from './pm-feature-save-history-ops.js'
