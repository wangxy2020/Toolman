export {
  PM_RESOURCE_VERSION_KEY,
  PM_RESOURCE_LAST_SAVED_AT_KEY,
  PM_RESOURCE_SAVE_HISTORY_KEY,
  PM_RESOURCE_CONTENT_FINGERPRINT_KEY,
  PM_RESOURCE_SAVE_HISTORY_MAX,
  normalizeResourceCatalogSnapshot,
  type PmResourceCatalogSnapshotRow,
  type PmResourceSaveRecord,
} from './pm-resource-save-history-types.js'

export {
  readResourceVersion,
  readMaxResourceVersion,
  readResourceLastSavedAt,
  readResourceContentFingerprint,
  readResourceSaveHistory,
  readResourceVersionCatalog,
  buildMetadataForResourceVersionSwitch,
  buildResourceSaveMetadata,
  removeResourceSaveHistoryEntry,
} from './pm-resource-save-history-ops.js'
