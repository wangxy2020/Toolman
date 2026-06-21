import { useCallback, useState } from 'react'

import {
  AUTH_REGISTRATION_REQUIRED_MESSAGE,
  canUseCommunityWrite,
  canUseGroupFeatures,
  checkAuthFeatureAccess,
  type AuthFeature,
} from '@toolman/shared'

import { UserCenterModal } from '../../components/user-center'
import { useUserAccount } from './useUserAccount'
import { RegistrationRequiredModal } from './RegistrationRequiredModal'
import { useAuthSession } from './AuthSessionProvider'

export function useRegistrationGate() {
  const { session, loading, refresh } = useAuthSession()
  const account = useUserAccount()
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
      <UserCenterModal
        open={authEntryOpen}
        initialView="register"
        onClose={() => setAuthEntryOpen(false)}
        onSuccess={() => {
          void refresh()
        }}
        successBehavior="close"
        account={account}
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
