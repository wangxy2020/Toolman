import { useState } from 'react'

import { AuthGuardModal } from '../user/AuthGuardModal'
import { useI18n } from '../../i18n/useI18n'

const STORAGE_KEY = 'toolman:onboarding:v1'

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function FirstRunWelcomeModal() {
  const { t } = useI18n()
  const [open, setOpen] = useState(() => !hasCompletedOnboarding())

  return (
    <AuthGuardModal
      isOpen={open}
      icon="welcome"
      title={t('onboarding.title')}
      description={t('onboarding.description')}
      cancelText={t('onboarding.later')}
      confirmText={t('onboarding.getStarted')}
      onCancel={() => setOpen(false)}
      onConfirm={() => {
        markOnboardingComplete()
        setOpen(false)
      }}
    >
      <ul className="tm-auth-guard-steps">
        <li>{t('onboarding.stepProvider')}</li>
        <li>{t('onboarding.stepKnowledge')}</li>
        <li>{t('onboarding.stepGroup')}</li>
      </ul>
      <p className="tm-auth-guard-note">{t('onboarding.betaHint')}</p>
    </AuthGuardModal>
  )
}
