/**
 * Group P2P UI refresh policy — keep debounce/hysteresis values in one place.
 *
 * Sync rules live in group-p2p-sync-policy.ts:
 * - Bootstrap: session enter + join + manual refresh
 * - Activity: metadata vs content events only
 */
export const GROUP_P2P_UI_TIMING = {
  /** Reload local resource lists after relevant activity events. */
  dataRefreshDebounceMs: 400,
  /** Backend joiner catch-up debounce (bootstrap IPC only). */
  joinerCatchUpDebounceMs: 1500,
  /** Refresh sync status after connection / discovery changes. */
  syncStatusRefreshDebounceMs: 300,
  /** Show global sync hint only after sync activity persists this long. */
  syncIndicatorShowDelayMs: 800,
  /** Keep sync hint visible this long after activity stops (anti-flicker). */
  syncIndicatorHideDelayMs: 1200,
} as const
