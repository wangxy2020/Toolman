import { useEffect, useState } from 'react'

import type { AuthGetFirebaseConfigOutput, AuthGetTencentConfigOutput } from '@toolman/shared'

import { getFirebaseWebConfig, getTencentWebConfig } from './auth-api.client'

export function useAuthProviderConfig() {
  const [firebase, setFirebase] = useState<AuthGetFirebaseConfigOutput | null>(null)
  const [tencent, setTencent] = useState<AuthGetTencentConfigOutput | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void Promise.all([getFirebaseWebConfig(), getTencentWebConfig()])
      .then(([firebaseConfig, tencentConfig]) => {
        if (cancelled) return
        setFirebase(firebaseConfig)
        setTencent(tencentConfig)
      })
      .catch(() => {
        if (cancelled) return
        setFirebase({ configured: false })
        setTencent({ configured: false })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const firebaseConfigured = firebase?.configured === true
  const wechatConfigured = tencent?.configured === true && tencent.wechatConfigured
  const phoneConfigured = tencent?.configured === true && tencent.phoneConfigured

  return {
    loading,
    firebase,
    tencent,
    firebaseConfigured,
    wechatConfigured,
    phoneConfigured,
  }
}
