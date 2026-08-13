import { ManagementClient } from 'authing-js-sdk'

import {
  getAuthingConfig,
  isAuthingConfigured,
  resolveAuthingManagementHost,
} from './authing-auth.config.js'

let managementClient: ManagementClient | null = null

export function getAuthingManagementClient(): ManagementClient | null {
  const config = getAuthingConfig()
  const poolId = config?.userPoolId?.trim()
  const secret = config?.userPoolSecret?.trim()
  // Management API requires the real user-pool id, not the application id.
  if (!config || !poolId || !secret || secret === poolId) {
    return null
  }

  if (!managementClient) {
    managementClient = new ManagementClient({
      userPoolId: poolId,
      secret,
      host: resolveAuthingManagementHost(),
    })
  }

  return managementClient
}

export function resetAuthingManagementClientForTests(): void {
  managementClient = null
}

export function canFetchAuthingUserRoles(): boolean {
  return isAuthingConfigured()
}
