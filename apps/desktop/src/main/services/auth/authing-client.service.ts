import { AuthenticationClient } from 'authing-js-sdk'

import { getAuthingConfig } from './authing-auth.config.js'

let client: AuthenticationClient | null = null

export function getAuthingClient(): AuthenticationClient {
  const config = getAuthingConfig()
  if (!config) {
    throw new Error('Authing 未配置')
  }

  if (!client) {
    client = new AuthenticationClient({
      appId: config.appId,
      secret: config.appSecret || undefined,
      appHost: config.appHost,
      redirectUri: undefined,
    })
  }

  return client
}

export function resetAuthingClientForTests(): void {
  client = null
}
