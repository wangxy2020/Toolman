/**
 * Local Sync Hub HTTP server (desktop). Implements the Sync API surface used by
 * `@toolman/sync-client` so mobile can push/pull notes, export sync-KB
 * files/chunks/vectors, and invoke desktop host capabilities without a cloud Hub.
 */

export {
  getMobileSyncHubBaseUrl,
  getMobileSyncHubPort,
  startMobileSyncHub,
  stopMobileSyncHub,
} from './mobile-sync-hub-lifecycle'
