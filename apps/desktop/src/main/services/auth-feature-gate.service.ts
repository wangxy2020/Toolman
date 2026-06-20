import {
  AUTH_ERROR_CODES,
  AUTH_REGISTRATION_REQUIRED_MESSAGE,
  checkAuthFeatureAccess,
  ipcErr,
  type AuthFeature,
  type AuthSession,
  type IpcResult,
} from '@toolman/shared'

import { getAuthSession } from './auth-session.service'

export function getAuthGateIpcError(
  feature: AuthFeature,
  session: AuthSession = getAuthSession(),
): IpcResult<never> | null {
  const access = checkAuthFeatureAccess(session, feature)
  if (access.allowed) return null

  return ipcErr({
    code: AUTH_ERROR_CODES.REGISTRATION_REQUIRED,
    message: access.message ?? AUTH_REGISTRATION_REQUIRED_MESSAGE,
    retryable: false,
  })
}

export function assertRegisteredForFeature(feature: AuthFeature, session?: AuthSession): void {
  const access = checkAuthFeatureAccess(session ?? getAuthSession(), feature)
  if (!access.allowed) {
    throw new AuthRegistrationRequiredError(access.message ?? AUTH_REGISTRATION_REQUIRED_MESSAGE)
  }
}

export class AuthRegistrationRequiredError extends Error {
  readonly code = AUTH_ERROR_CODES.REGISTRATION_REQUIRED

  constructor(message: string) {
    super(message)
    this.name = 'AuthRegistrationRequiredError'
  }
}
