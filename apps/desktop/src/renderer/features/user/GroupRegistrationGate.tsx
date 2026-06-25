import { AuthGuardModal } from './AuthGuardModal'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  onDismiss?: () => void
  onRegister?: () => void
}

export function GroupRegistrationGate({ onDismiss, onRegister }: Props) {
  const { t } = useI18n()
  return (
    <AuthGuardModal
      isOpen
      title={t('user.guard.titleGroup')}
      description={t('user.guard.descriptionGroup')}
      confirmText={t('user.guard.goRegister')}
      cancelText={t('user.account.back')}
      onConfirm={() => onRegister?.()}
      onCancel={() => onDismiss?.()}
    />
  )
}
