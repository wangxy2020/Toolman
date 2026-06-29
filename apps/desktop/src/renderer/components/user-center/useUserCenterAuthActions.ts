import type { AuthOtpChannel, AuthProvider, AuthRegion } from '@toolman/shared'

import {
  AuthMergeRequiredError,
  loginAuth,
  resetAuthPassword,
  sendAuthSmsCode,
} from '../../features/user/auth-api.client'
import { formatFirebaseAuthError, signInWithFirebaseOAuth } from '../../features/user/firebase-auth.client'
import type { TranslateFn } from '../../i18n/useI18n'
import type { ViewMode } from './types'
import { isCnEmailAccountInput } from './useUserCenterAuthLabels'

export interface UserCenterAuthSubmitContext {
  view: ViewMode
  region: AuthRegion
  email: string
  password: string
  confirmPassword: string
  account: string
  smsCode: string
  cnAccountIsEmail: boolean
  mergeState: {
    mergeToken: string
    maskedPhone: string
    wechatLabel: string
  } | null
  codeIntent: 'register' | 'reset' | 'login'
  t: TranslateFn
  onAuthComplete: () => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
  setSendingCode: (sending: boolean) => void
  setOtpChannel: (channel: AuthOtpChannel | null) => void
  setOtpExpiresMinutes: (minutes: number) => void
  setSmsCooldown: (seconds: number) => void
  setDevHint: (hint: string | null) => void
  setMergeState: (state: UserCenterAuthSubmitContext['mergeState']) => void
  resetFormFields: () => void
}

export function createUserCenterAuthActions(ctx: UserCenterAuthSubmitContext) {
  const sendVerificationCode = async () => {
    ctx.setSendingCode(true)
    ctx.setError(null)
    try {
      const result = await sendAuthSmsCode({
        account: ctx.account.trim(),
        region: 'cn',
        intent: ctx.codeIntent,
      })
      ctx.setOtpChannel(result.channel)
      ctx.setOtpExpiresMinutes(Math.max(1, Math.round((result.expiresInSeconds ?? 120) / 60)))
      ctx.setSmsCooldown(result.retryAfterSeconds)
      ctx.setDevHint(result.devHint ?? null)
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : ctx.t('user.errors.sendCodeFailed')
      ctx.setError(message)
    } finally {
      ctx.setSendingCode(false)
    }
  }

  const submitResetPassword = async () => {
    ctx.setBusy(true)
    ctx.setError(null)
    try {
      if (ctx.region === 'intl') {
        const result = await resetAuthPassword({
          region: 'intl',
          account: ctx.email.trim(),
        })
        ctx.resetFormFields()
        ctx.setDevHint(result.message ?? ctx.t('user.auth.hintResetEmailSent'))
        return
      }

      await resetAuthPassword({
        region: 'cn',
        account: ctx.account.trim(),
        code: ctx.smsCode.trim(),
        password: ctx.password,
        confirmPassword: ctx.confirmPassword,
      })
      ctx.resetFormFields()
      ctx.setDevHint(ctx.t('user.auth.hintPasswordReset'))
    } catch (submitError) {
      ctx.setError(
        submitError instanceof Error ? submitError.message : ctx.t('user.errors.resetPasswordFailed'),
      )
    } finally {
      ctx.setBusy(false)
    }
  }

  const submit = async (method: AuthProvider) => {
    ctx.setBusy(true)
    ctx.setError(null)
    try {
      if (method === 'firebase_google' || method === 'firebase_apple') {
        const idToken = await signInWithFirebaseOAuth(method)
        await loginAuth({
          region: 'intl',
          method,
          payload: { idToken },
        })
      } else if (method === 'tencent_wechat' && ctx.mergeState) {
        await loginAuth({
          region: 'cn',
          method: 'tencent_wechat',
          payload: {
            mergeToken: ctx.mergeState.mergeToken,
            phone: ctx.account.trim(),
            code: ctx.smsCode.trim(),
          },
        })
      } else {
        const intent = ctx.view === 'register' ? 'register' : 'login'
        await loginAuth({
          region: ctx.region,
          method,
          payload:
            method === 'firebase_email'
              ? { email: ctx.email.trim(), password: ctx.password, intent }
              : method === 'tencent_phone'
                ? ctx.view === 'register'
                  ? {
                      account: ctx.account.trim(),
                      code: ctx.smsCode.trim(),
                      password: ctx.password,
                      confirmPassword: ctx.confirmPassword,
                      intent: 'register' as const,
                    }
                  : ctx.cnAccountIsEmail
                    ? { account: ctx.account.trim(), password: ctx.password, intent: 'login' as const }
                    : { account: ctx.account.trim(), code: ctx.smsCode.trim(), intent: 'login' as const }
                : undefined,
        })
      }
      ctx.onAuthComplete()
    } catch (submitError) {
      if (submitError instanceof AuthMergeRequiredError) {
        ctx.setMergeState(submitError.details)
        ctx.setError(null)
        return
      }
      const message =
        submitError instanceof Error ? formatFirebaseAuthError(submitError) : ctx.t('user.errors.loginFailed')
      ctx.setError(message)
    } finally {
      ctx.setBusy(false)
    }
  }

  return { sendVerificationCode, submitResetPassword, submit }
}

export { isCnEmailAccountInput }
