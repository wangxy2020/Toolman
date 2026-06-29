import type { CommunityHttpClient } from '../community-http.client'
import { HEALTH_POLL_INTERVAL_MS, HEALTH_POLL_MAX_ATTEMPTS } from './types'

export async function waitForHealth(client: CommunityHttpClient): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < HEALTH_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
        return
      }
      lastError = new Error(`unexpected health status: ${health.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('community hub health check timed out')
}
