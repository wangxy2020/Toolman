import type { CommunityHubMode } from '@toolman/shared'
import { COMMUNITY_HUB_HOST } from '../community-paths'

export interface CommunityHubPortFile {
  host: string
  port: number
  pid: number
  startedAt: number
}

export interface CommunityHubStatus {
  running: boolean
  mode: CommunityHubMode
  port: number | null
  host: string
  baseUrl: string | null
  binaryPath: string | null
  offlineReadOnly: boolean
  error?: string
}

export const HEALTH_POLL_INTERVAL_MS = 200
export const HEALTH_POLL_MAX_ATTEMPTS = 75
export const HUB_START_MAX_ATTEMPTS = 3

export function createInitialHubStatus(): CommunityHubStatus {
  return {
    running: false,
    mode: 'local',
    port: null,
    host: COMMUNITY_HUB_HOST,
    baseUrl: null,
    binaryPath: null,
    offlineReadOnly: false,
  }
}
