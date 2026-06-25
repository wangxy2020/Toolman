import type { AuthFeature } from '@toolman/shared'

import { AuthGuardModal } from './AuthGuardModal'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  open: boolean
  feature: AuthFeature
  message?: string
  onClose: () => void
  onRegister: () => void
}

function featureTitle(feature: AuthFeature, t: ReturnType<typeof useI18n>['t']): string {
  switch (feature) {
    case 'group':
      return t('user.guard.titleGroup')
    case 'community_write':
      return t('user.guard.titleCommunityWrite')
    default:
      return t('user.guard.titleDefault')
  }
}

export function RegistrationRequiredModal({
  open,
  feature,
  message,
  onClose,
  onRegister,
}: Props) {
  const { t } = useI18n()

  return (
    <AuthGuardModal
      isOpen={open}
      title={featureTitle(feature, t)}
      description={message ?? t('user.guard.descriptionDefault')}
      confirmText={t('user.guard.goRegister')}
      cancelText={t('user.guard.dismiss')}
      onConfirm={onRegister}
      onCancel={onClose}
    />
  )
}
