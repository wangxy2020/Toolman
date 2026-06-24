import { readCommunityHubConfig, resolveCommunityHubBaseUrl } from './community/community-hub.config'
import { getCommunityHubStatus } from './community/community-bridge.service'

export function resolveCrashReportIngestUrl(): string | null {
  const explicit = process.env['TOOLMAN_CRASH_REPORT_URL']?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  const hubConfig = readCommunityHubConfig()
  if (hubConfig.mode === 'remote') {
    return `${resolveCommunityHubBaseUrl()}/api/v1/diagnostics/crashes`
  }

  const status = getCommunityHubStatus()
  if (status.running && status.baseUrl) {
    return `${status.baseUrl.replace(/\/$/, '')}/api/v1/diagnostics/crashes`
  }

  return null
}
