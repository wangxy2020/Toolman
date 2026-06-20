import {
  IpcChannel,
  AUTH_ERROR_CODES,
  AuthMergeRequiredDetailsSchema,
  type AuthBindProviderInput,
  type AuthBindProviderOutput,
  type AuthDeleteAccountInput,
  type AuthDeleteAccountOutput,
  type AuthExchangeHubTokenInput,
  type AuthExchangeHubTokenOutput,
  type AuthMergeRequiredDetails,
  type AuthGetFirebaseConfigOutput,
  type AuthGetBuildProfileOutput,
  type AuthGetSessionOutput,
  type AuthGetTencentConfigOutput,
  type AuthLoginInput,
  type AuthLoginOutput,
  type AuthLogoutInput,
  type AuthLogoutOutput,
  type AuthSendSmsCodeInput,
  type AuthSendSmsCodeOutput,
  type AuthVerifyDeleteReauthInput,
  type AuthVerifyDeleteReauthOutput,
  type IpcResult,
} from '@toolman/shared'

function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data
}

export class AuthMergeRequiredError extends Error {
  readonly details: AuthMergeRequiredDetails

  constructor(message: string, details: AuthMergeRequiredDetails) {
    super(message)
    this.name = 'AuthMergeRequiredError'
    this.details = details
  }
}

function unwrapAuthLogin(result: IpcResult<{ session: AuthLoginOutput['session'] }>): AuthLoginOutput {
  if (!result.ok) {
    if (result.error.code === AUTH_ERROR_CODES.MERGE_REQUIRED) {
      throw new AuthMergeRequiredError(
        result.error.message,
        AuthMergeRequiredDetailsSchema.parse(result.error.details),
      )
    }
    throw new Error(result.error.message)
  }
  return result.data
}

export async function getAuthSession(): Promise<AuthGetSessionOutput> {
  return unwrap((await window.api.invoke(IpcChannel.AuthGetSession)) as IpcResult<AuthGetSessionOutput>)
}

export async function getFirebaseWebConfig(): Promise<AuthGetFirebaseConfigOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthGetFirebaseConfig)) as IpcResult<AuthGetFirebaseConfigOutput>,
  )
}

export async function getTencentWebConfig(): Promise<AuthGetTencentConfigOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthGetTencentConfig)) as IpcResult<AuthGetTencentConfigOutput>,
  )
}

export async function getAuthBuildProfile(): Promise<AuthGetBuildProfileOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthGetBuildProfile)) as IpcResult<AuthGetBuildProfileOutput>,
  )
}

export async function sendAuthSmsCode(input: AuthSendSmsCodeInput): Promise<AuthSendSmsCodeOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthSendSmsCode, input)) as IpcResult<AuthSendSmsCodeOutput>,
  )
}

export async function loginAuth(input: AuthLoginInput): Promise<AuthLoginOutput> {
  return unwrapAuthLogin(
    (await window.api.invoke(IpcChannel.AuthLogin, input)) as IpcResult<AuthLoginOutput>,
  )
}

export async function logoutAuth(input: AuthLogoutInput = {}): Promise<AuthLogoutOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthLogout, input)) as IpcResult<AuthLogoutOutput>,
  )
}

export class AuthReauthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthReauthRequiredError'
  }
}

function unwrapAuthDeleteAccount(
  result: IpcResult<AuthDeleteAccountOutput>,
): AuthDeleteAccountOutput {
  if (!result.ok) {
    if (result.error.code === AUTH_ERROR_CODES.REAUTH_REQUIRED) {
      throw new AuthReauthRequiredError(result.error.message)
    }
    throw new Error(result.error.message)
  }
  return result.data
}

export async function verifyDeleteAccountReauth(
  input: AuthVerifyDeleteReauthInput,
): Promise<AuthVerifyDeleteReauthOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthVerifyDeleteReauth, input)) as IpcResult<AuthVerifyDeleteReauthOutput>,
  )
}

export async function deleteAuthAccount(
  input: AuthDeleteAccountInput,
): Promise<AuthDeleteAccountOutput> {
  return unwrapAuthDeleteAccount(
    (await window.api.invoke(IpcChannel.AuthDeleteAccount, input)) as IpcResult<AuthDeleteAccountOutput>,
  )
}

export async function bindAuthProvider(
  input: AuthBindProviderInput,
): Promise<AuthBindProviderOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthBindProvider, input)) as IpcResult<AuthBindProviderOutput>,
  )
}

export async function exchangeAuthHubToken(
  input: AuthExchangeHubTokenInput = {},
): Promise<AuthExchangeHubTokenOutput> {
  return unwrap(
    (await window.api.invoke(IpcChannel.AuthExchangeHubToken, input)) as IpcResult<AuthExchangeHubTokenOutput>,
  )
}
