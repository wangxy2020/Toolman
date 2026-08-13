import { AuthLoginError } from './auth-login.error.js'
import { formatAuthingRegisterExistsMessage } from './authing-otp-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { getAuthingManagementClient } from './authing-management-client.service.js'
import type { ParsedCnAuthAccount } from './cn-account-utils.js'

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '')
}

async function checkAuthingUserExistsViaAuthClient(account: ParsedCnAuthAccount): Promise<boolean | null> {
  const client = getAuthingClient()

  try {
    if (account.channel === 'email' && account.email) {
      return (await client.isUserExists({ email: account.email })) === true
    }

    if (account.channel === 'phone' && account.phone) {
      return (await client.isUserExists({ phone: phoneDigits(account.phone) })) === true
    }
  } catch {
    return null
  }

  return null
}

async function checkAuthingUserExistsViaManagement(account: ParsedCnAuthAccount): Promise<boolean | null> {
  const management = getAuthingManagementClient()
  if (!management) {
    return null
  }

  try {
    if (account.channel === 'email' && account.email) {
      return (await management.users.exists({ email: account.email })) === true
    }

    if (account.channel === 'phone' && account.phone) {
      return (await management.users.exists({ phone: phoneDigits(account.phone) })) === true
    }
  } catch {
    return null
  }

  return null
}

export async function checkAuthingUserExists(account: ParsedCnAuthAccount): Promise<boolean> {
  const authResult = await checkAuthingUserExistsViaAuthClient(account)
  if (authResult === true) {
    return true
  }

  const managementResult = await checkAuthingUserExistsViaManagement(account)
  if (managementResult === true) {
    return true
  }

  return false
}

export async function assertAuthingRegisterAccountAvailable(
  account: ParsedCnAuthAccount,
  requestedIntent: 'login' | 'register',
): Promise<void> {
  if (requestedIntent !== 'register') {
    return
  }

  if (await checkAuthingUserExists(account)) {
    throw new AuthLoginError(formatAuthingRegisterExistsMessage(account.channel))
  }
}
