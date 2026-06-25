import {
  toErrorMessage,
  IpcChannel,
  ipcOk,
  ipcErr,
  AuthBindProviderInputSchema,
  AuthDeleteAccountInputSchema,
  AuthExchangeHubTokenInputSchema,
  AuthLoginInputSchema,
  AuthLogoutInputSchema,
  AuthChangePasswordInputSchema,
  AuthResetPasswordInputSchema,
  AuthSendSmsCodeInputSchema,
  AuthVerifyDeleteReauthInputSchema,
  AUTH_ERROR_CODES,
  AuthMergeRequiredDetailsSchema,
  type IpcResult,
} from '@toolman/shared'
import * as authSessionService from '../services/auth-session.service'
import * as authLoginService from '../services/auth/auth-login.service'
import {
  deleteAuthAccountRemote,
  verifyDeleteAccountReauth,
} from '../services/auth/auth-delete-account.service'
import { bindAuthProvider, AuthMergeRequiredError } from '../services/auth/tencent-wechat-auth.service'
import { getFirebaseWebConfig } from '../services/auth/firebase-auth.config'
import { getTencentWebConfig } from '../services/auth/tencent-auth.config'
import { getAuthBuildProfile } from '../services/auth/auth-build-profile.service'
import { AuthLoginError, readAuthServiceErrorMessage } from '../services/auth/auth-login.error'
import { exchangeAuthHubToken } from '../services/auth/auth-hub-token.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export const authIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.AuthGetSession]: async () => {
    try {
      return ipcOk(authSessionService.getAuthSession())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load auth session')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthLogin]: async (input) => {
    try {
      const session = await authLoginService.loginAuth(AuthLoginInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = toErrorMessage(error, 'Login failed')
      if (error instanceof AuthLoginError && message.includes('尚未实现')) {
        return ipcErr({ code: AUTH_ERROR_CODES.NOT_IMPLEMENTED, message, retryable: false })
      }
      if (error instanceof AuthLoginError && message.includes('未配置')) {
        return ipcErr({ code: AUTH_ERROR_CODES.NOT_CONFIGURED, message, retryable: false })
      }
      if (error instanceof AuthMergeRequiredError) {
        return ipcErr({
          code: AUTH_ERROR_CODES.MERGE_REQUIRED,
          message,
          details: AuthMergeRequiredDetailsSchema.parse({
            mergeToken: error.mergeToken,
            maskedPhone: error.maskedPhone,
            wechatLabel: error.wechatLabel,
          }),
          retryable: false,
        })
      }
      const code = message.includes('尚未实现') ? AUTH_ERROR_CODES.NOT_IMPLEMENTED : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthLogout]: async (input) => {
    try {
      AuthLogoutInputSchema.parse(input ?? {})
      return ipcOk({ session: authSessionService.logoutAuthSession() })
    } catch (error) {
      const message = toErrorMessage(error, 'Logout failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthDeleteAccount]: async (input) => {
    try {
      const session = await deleteAuthAccountRemote(AuthDeleteAccountInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = toErrorMessage(error, 'Delete account failed')
      const code = message.includes('再次验证')
        ? AUTH_ERROR_CODES.REAUTH_REQUIRED
        : message.includes('尚未实现')
          ? AUTH_ERROR_CODES.NOT_IMPLEMENTED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthVerifyDeleteReauth]: async (input) => {
    try {
      return ipcOk(await verifyDeleteAccountReauth(AuthVerifyDeleteReauthInputSchema.parse(input)))
    } catch (error) {
      const message = toErrorMessage(error, 'Reauth verification failed')
      const code = message.includes('未配置') ? AUTH_ERROR_CODES.NOT_CONFIGURED : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthGetFirebaseConfig]: async () => {
    try {
      return ipcOk(getFirebaseWebConfig())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load Firebase config')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthGetTencentConfig]: async () => {
    try {
      return ipcOk(getTencentWebConfig())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load Tencent config')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthGetBuildProfile]: async () => {
    try {
      return ipcOk(getAuthBuildProfile())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load auth build profile')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthSendSmsCode]: async (input) => {
    try {
      return ipcOk(await authLoginService.sendAuthSmsCode(AuthSendSmsCodeInputSchema.parse(input)))
    } catch (error) {
      const message =
        readAuthServiceErrorMessage(error) ?? '验证码发送失败，请稍后重试'
      const code =
        error instanceof AuthLoginError && message.includes('未配置')
          ? AUTH_ERROR_CODES.NOT_CONFIGURED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthResetPassword]: async (input) => {
    try {
      return ipcOk(await authLoginService.resetAuthPassword(AuthResetPasswordInputSchema.parse(input)))
    } catch (error) {
      const message = readAuthServiceErrorMessage(error) ?? '重置密码失败，请稍后重试'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthChangePassword]: async (input) => {
    try {
      return ipcOk(await authLoginService.changeAuthPassword(AuthChangePasswordInputSchema.parse(input)))
    } catch (error) {
      const message = readAuthServiceErrorMessage(error) ?? '修改密码失败，请稍后重试'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthBindProvider]: async (input) => {
    try {
      const session = await bindAuthProvider(AuthBindProviderInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = toErrorMessage(error, 'Bind provider failed')
      const code = message.includes('未配置')
        ? AUTH_ERROR_CODES.NOT_CONFIGURED
        : message.includes('尚未实现')
          ? AUTH_ERROR_CODES.NOT_IMPLEMENTED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthExchangeHubToken]: async (input) => {
    try {
      AuthExchangeHubTokenInputSchema.parse(input ?? {})
      const token = await exchangeAuthHubToken()
      return ipcOk(token)
    } catch (error) {
      const message = toErrorMessage(error, 'Hub token exchange failed')
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },
}
