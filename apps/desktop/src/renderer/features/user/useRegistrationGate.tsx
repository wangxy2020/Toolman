import { useCallback, useState } from 'react'

import {
  AUTH_REGISTRATION_REQUIRED_MESSAGE,
  canUseCommunityWrite,
  canUseGroupFeatures,
  checkAuthFeatureAccess,
  type AuthFeature,
} from '@toolman/shared'

import { AuthEntryModal } from './AuthEntryModal'
import { RegistrationRequiredModal } from './RegistrationRequiredModal'
import { useAuthSession } from './AuthSessionProvider'

export function useRegistrationGate() {
  const { session, loading, refresh } = useAuthSession()
  const [modalOpen, setModalOpen] = useState(false)
  const [authEntryOpen, setAuthEntryOpen] = useState(false)
  const [modalFeature, setModalFeature] = useState<AuthFeature>('community_write')
  const [modalMessage, setModalMessage] = useState<string | undefined>()

  const openRegister = useCallback(() => {
    setModalOpen(false)
    setAuthEntryOpen(true)
  }, [])

  const requireRegistration = useCallback(
    (feature: AuthFeature, message?: string) => {
      const access = checkAuthFeatureAccess(session, feature)
      if (access.allowed) return true
      setModalFeature(feature)
      setModalMessage(message ?? access.message ?? AUTH_REGISTRATION_REQUIRED_MESSAGE)
      setModalOpen(true)
      return false
    },
    [session],
  )

  const modal = (
    <>
      <RegistrationRequiredModal
        open={modalOpen}
        feature={modalFeature}
        message={modalMessage}
        onClose={() => setModalOpen(false)}
        onRegister={openRegister}
      />
      <AuthEntryModal
        open={authEntryOpen}
        mode="register"
        onClose={() => setAuthEntryOpen(false)}
        onSuccess={() => {
          void refresh()
        }}
      />
    </>
  )

  return {
    session,
    loading,
    canUseGroup: canUseGroupFeatures(session),
    canUseCommunityWrite: canUseCommunityWrite(session),
    requireRegistration,
    openRegister,
    modal,
  }
}
