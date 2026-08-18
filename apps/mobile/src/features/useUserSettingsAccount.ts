import { useEffect, useState } from 'react'
import {
  bindPhoneToAccount,
  changePassword,
  deleteAccount,
  logoutLocal,
  setSubscriptionSku,
  updateDisplayName,
} from '../auth/localAuth'
import {
  sendAuthingVerificationCode,
  verifyAuthingPhoneCode,
} from '../auth/authingOtp'
import type { MobileAuthSession } from '../auth/types'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import { resetMobileSyncBaseUrlCache } from '../sync/mobileSync'
import { getOrCreateDeviceId } from '../storage/secure'
import {
  clearDevicePairing,
  formatPairingStatus,
  loadDevicePairing,
  redeemDevicePairingCode,
} from '../storage/devicePairing'
import { Platform } from 'react-native'
import { isShortPairingCode, normalizePairingCode } from '@toolman/shared'
import {
  formatAccountLabel,
  formatBindPhoneOtpHint,
  formatBindPhoneTitle,
  formatProfileRoleLabel,
  formatSkuLabel,
  formatSyncActionTitle,
  isVipAccount,
  toErrorMessage,
  type AccountView,
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

export function useLoggedInAccount(props: {
  auth: MobileAuthSession
  setAuth: (session: MobileAuthSession | null) => void
  syncStatus: string
  onSync: () => Promise<string>
}) {
  const { auth, setAuth } = props
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const [view, setView] = useState<AccountView>('main')
  const [displayName, setDisplayName] = useState(auth.displayName)
  const [bindPhone, setBindPhone] = useState('')
  const [bindCode, setBindCode] = useState('')
  const [smsCooldown, setSmsCooldown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [otpHint, setOtpHint] = useState<string | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pairingCode, setPairingCode] = useState('')
  const [pairingStatus, setPairingStatus] = useState('未配对桌面设备')
  const [devicePaired, setDevicePaired] = useState(false)

  useSmsCooldown(smsCooldown, setSmsCooldown)

  useEffect(() => {
    void loadDevicePairing().then((record) => {
      setPairingStatus(formatPairingStatus(record))
      setDevicePaired(Boolean(record))
    })
  }, [auth.identityId])

  const redeemPairing = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const deviceId = await getOrCreateDeviceId()
      const role = Platform.OS === 'web' ? 'web' : 'mobile'
      const record = await redeemDevicePairingCode({
        code: pairingCode,
        localDeviceId: deviceId,
        role,
      })
      setHubToken(isShortPairingCode(pairingCode) ? normalizePairingCode(pairingCode) : pairingCode.trim())
      setPairingStatus(formatPairingStatus(record))
      setDevicePaired(true)
      setPairingCode('')
      setMessage('设备配对成功')
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const clearPairing = async () => {
    await clearDevicePairing()
    setPairingStatus(formatPairingStatus(null))
    setDevicePaired(false)
    setPairingCode('')
    setMessage('已清除设备配对')
  }

  const sendBindPhoneCode = async () => {
    setSendingCode(true)
    setMessage(null)
    setOtpHint(null)
    try {
      const result = await sendAuthingVerificationCode(bindPhone, 'login')
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setSmsCooldown(result.retryAfterSeconds)
      setOtpHint(formatBindPhoneOtpHint(result.expiresInSeconds, result.devHint))
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setSendingCode(false)
    }
  }

  const submitPasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的密码不一致')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await changePassword({
        identityId: auth.identityId,
        oldPassword,
        newPassword,
      })
      setMessage(result.ok ? '密码已更新，请使用新密码登录。' : result.message)
      if (result.ok) {
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setView('main')
      }
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const submitSkuChange = async (sku: MobileAuthSession['subscriptionSku']) => {
    const result = await setSubscriptionSku({
      identityId: auth.identityId,
      sku,
    })
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setAuth(result.session)
    setMessage(sku === 'pro' ? '已开通专业版' : '已恢复社区版')
    setView('main')
  }

  const submitDeleteAccount = async () => {
    setMessage(null)
    try {
      const result = await deleteAccount({
        identityId: auth.identityId,
        password: deletePassword,
        confirmation: deleteConfirm,
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setAuth(null)
    } catch (error) {
      setMessage(toErrorMessage(error))
    }
  }

  const submitBindPhone = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const verified = await verifyAuthingPhoneCode(bindPhone, bindCode)
      if (!verified.ok) {
        setMessage(verified.message)
        return
      }
      const result = await bindPhoneToAccount({
        identityId: auth.identityId,
        phone: bindPhone,
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setAuth(result.session)
      setBindCode('')
      setOtpHint(null)
      setMessage('手机号已绑定')
      setView('main')
    } catch (error) {
      setMessage(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const notifyWechatUnavailable = () => {
    setMessage('移动端暂未接入微信授权，请使用桌面端绑定。')
  }

  const saveDisplayName = async () => {
    setMessage(null)
    try {
      const result = await updateDisplayName({
        identityId: auth.identityId,
        displayName,
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setAuth(result.session)
      setMessage('资料已保存')
    } catch (error) {
      setMessage(toErrorMessage(error))
    }
  }

  const syncNow = async () => {
    setMessage(await props.onSync())
  }

  const setHubToken = (hubToken: string) => {
    const next = {
      ...modulePrefs,
      sync: { ...modulePrefs.sync, hubToken },
    }
    setModulePrefs(next)
    void saveModulePrefs(next)
  }

  const setHubBaseUrl = (hubBaseUrl: string) => {
    const next = {
      ...modulePrefs,
      sync: { ...modulePrefs.sync, hubBaseUrl },
    }
    setModulePrefs(next)
    resetMobileSyncBaseUrlCache()
    void saveModulePrefs(next)
  }

  const logout = async () => {
    await logoutLocal()
    setAuth(null)
  }

  const openBindPhone = () => {
    setBindPhone(auth.phone ?? '')
    setBindCode('')
    setOtpHint(null)
    setMessage(null)
    setView('bind_phone')
  }

  const openBindWechat = () => {
    setMessage(null)
    setView('bind_wechat')
  }

  const onBindPhoneChange = (value: string) => {
    setBindPhone(value)
    setOtpHint(null)
  }

  const hasPhoneBinding = Boolean(auth.phone)

  return {
    view,
    setView,
    displayName,
    setDisplayName,
    bindPhone,
    bindCode,
    setBindCode,
    smsCooldown,
    sendingCode,
    otpHint,
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    deletePassword,
    setDeletePassword,
    deleteConfirm,
    setDeleteConfirm,
    message,
    busy,
    skuLabel: formatSkuLabel(auth.subscriptionSku),
    accountLabel: formatAccountLabel(auth),
    isVip: isVipAccount(auth),
    hasPhoneBinding,
    hasWechatBinding: Boolean(auth.wechatBound),
    profileRoleLabel: formatProfileRoleLabel(auth),
    syncTitle: formatSyncActionTitle(props.syncStatus),
    hubToken: modulePrefs.sync.hubToken,
    setHubToken,
    hubBaseUrl: modulePrefs.sync.hubBaseUrl ?? '',
    setHubBaseUrl,
    pairingCode,
    setPairingCode,
    pairingStatus,
    devicePaired,
    redeemPairing,
    clearPairing,
    bindPhoneTitle: formatBindPhoneTitle(auth.phone),
    isPro: auth.subscriptionSku === 'pro',
    syncing: props.syncStatus === 'syncing',
    sendBindPhoneCode,
    submitPasswordChange,
    submitSkuChange,
    submitDeleteAccount,
    submitBindPhone,
    notifyWechatUnavailable,
    saveDisplayName,
    syncNow,
    logout,
    openBindPhone,
    openBindWechat,
    onBindPhoneChange,
  }
}
