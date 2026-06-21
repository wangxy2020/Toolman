import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import { isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { getAuthingClient } from './authing-client.service.js'
import { assertMatchingPasswords, assertValidPasswordLength } from './authing-password-utils.js'

function formatChangePasswordError(error: unknown): string {
  const message = readAuthServiceErrorMessage(error)
  if (message && /密码|password|credential|凭证|旧密码/i.test(message)) {
    return '原密码错误'
  }
  return formatAuthingServiceError(message, '修改密码失败，请重试')
}

export async function changeCnAccountPassword(input: {
  accessToken: string
  oldPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<void> {
  const oldPassword = input.oldPassword.trim()
  const newPassword = input.newPassword.trim()
  const confirmPassword = input.confirmPassword.trim()

  assertValidPasswordLength(newPassword)
  assertMatchingPasswords(newPassword, confirmPassword)

  if (isAuthingDevMode()) {
    return
  }

  if (!isAuthingConfigured()) {
    throw new AuthLoginError('修改密码需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  const client = getAuthingClient()
  client.setToken(input.accessToken)

  try {
    await client.updatePassword(newPassword, oldPassword || undefined)
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatChangePasswordError(error))
  }
}
