import { useCallback, useEffect, useState } from 'react'
import { loginWithAccount } from '../auth/localAuth'
import {
  firebaseEmailAuth,
  firebaseOAuthLogin,
} from '../auth/firebaseAuth'
import { isMobileFirebaseConfigured } from '../auth/firebaseConfig'
import {
  loginWithAuthingPassword,
  registerWithVerificationCode,
  resetPasswordWithVerificationCode,
  sendAuthingVerificationCode,
} from '../auth/authingOtp'
import type { MobileAuthSession } from '../auth/types'
import { useMobileApp } from '../state/MobileAppContext'
import {
  formatOtpSentHint,
  guestAuthSubtitle,
  guestAuthTitle,
  guestPrimaryLabel,
  isAuthSuccessMessage,
  isGuestFormReady,
  toErrorMessage,
  type GuestView,
  type SocialProvider,
} from './userSettingsUtils'

function useSmsCooldown(
  smsCooldown: number,
  setSmsCooldown: (update: (value: number) => number) => void,
) {
  useEffect(() => {
    if (smsCooldown <= 0) return
    const timer = setTimeout(() => setSmsCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [smsCooldown, setSmsCooldown])
}

export function useUserSettingsPanel() {
  const { auth, setAuth, syncStatus, runSync } = useMobileApp()
  const onSync = useCallback(() => runSync('manual'), [runSync])
  return { auth, setAuth, syncStatus, onSync }
}

export function useGuestAuth(onSession: (session: MobileAuthSession) => void) {
  const [view, setView] = useState<GuestView>('login')
  const [account, setAccount] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const firebaseReady = isMobileFirebaseConfigured()
  const showOtpRow = view === 'register' || view === 'forgot'
  const showConfirmPassword = view === 'register' || view === 'forgot'
  const formReady = isGuestFormReady(view, account, password, smsCode, confirmPassword)

  useSmsCooldown(smsCooldown, setSmsCooldown)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const resetGuestFields = () => {
    setMessage(null)
    setSmsCode('')
    setPassword('')
    setConfirmPassword('')
    setOtpHint(null)
  }

  const goToView = (next: GuestView) => {
    setView(next)
    resetGuestFields()
  }

  const onAccountChange = (value: string) => {
    setAccount(value)
    setOtpHint(null)
  }

  const sendCode = async () => {
    setSendingCode(true)
    setMessage(null)
    setOtpHint(null)
    try {
      const result = await sendAuthingVerificationCode(
        account,
        view === 'forgot' ? 'reset' : 'register',
      )
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setSmsCooldown(result.retryAfterSeconds)
      setOtpHint(formatOtpSentHint(result.channel, result.expiresInSeconds, result.devHint))
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setSendingCode(false)
    }
  }

  const submitForm = () =>
    void run(async () => {
      if (view === 'forgot') {
        if (password !== confirmPassword) {
          setMessage('两次输入的密码不一致')
          return
        }
        const result = await resetPasswordWithVerificationCode({
          account,
          code: smsCode,
          password,
          confirmPassword,
        })
        if (!result.ok) {
          setMessage(result.message)
          return
        }
        setMessage('密码已重置，请使用新密码登录。')
        setView('login')
        setPassword('')
        setConfirmPassword('')
        setSmsCode('')
        setOtpHint(null)
        return
      }

      if (view === 'login') {
        const remote = await loginWithAuthingPassword({ account, password })
        if (remote.ok) {
          onSession(remote.session)
          return
        }

        const local = await loginWithAccount({
          account,
          password,
          region: 'cn',
        })
        if (local.ok) {
          onSession(local.session)
          return
        }

        if (account.includes('@') && firebaseReady) {
          const firebase = await firebaseEmailAuth({
            email: account,
            password,
            intent: 'login',
          })
          if (firebase.ok) {
            onSession(firebase.session)
            return
          }
          setMessage(remote.message === 'Authing 未配置' ? firebase.message : remote.message)
          return
        }

        setMessage(remote.message === 'Authing 未配置' ? local.message : remote.message)
        return
      }

      if (password !== confirmPassword) {
        setMessage('两次输入的密码不一致')
        return
      }
      if (!smsCode.trim()) {
        setMessage('请输入验证码')
        return
      }

      const result = await registerWithVerificationCode({
        account,
        code: smsCode,
        password,
        confirmPassword,
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      onSession(result.session)
    })

  const loginWithSocial = (id: SocialProvider) => {
    if (id !== 'apple' && id !== 'google') return
    void run(async () => {
      if (!firebaseReady) {
        setMessage('国际登录未配置')
        return
      }
      const result = await firebaseOAuthLogin(id === 'apple' ? 'firebase_apple' : 'firebase_google')
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      onSession(result.session)
    })
  }

  return {
    view,
    account,
    smsCode,
    setSmsCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    message,
    busy,
    sendingCode,
    smsCooldown,
    otpHint,
    firebaseReady,
    showOtpRow,
    showConfirmPassword,
    formReady,
    title: guestAuthTitle(view),
    subtitle: guestAuthSubtitle(view),
    primaryLabel: guestPrimaryLabel(view, busy, account),
    messageIsOk: isAuthSuccessMessage(message),
    sendCode,
    goToView,
    onAccountChange,
    submitForm,
    loginWithSocial,
  }
}

