import { ManagementClient } from 'authing-js-sdk'

import {
  getAuthingConfig,
  isAuthingConfigured,
  resolveAuthingManagementHost,
} from './authing-auth.config.js'

let managementClient: ManagementClient | null = null

export function getAuthingManagementClient(): ManagementClient | null {
  const config = getAuthingConfig()
  const secret = config?.userPoolSecret?.trim()
  if (!config || !secret || secret === config.userPoolId) {
    return null
  }

  if (!managementClient) {
    managementClient = new ManagementClient({
      userPoolId: config.userPoolId,
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
