import type { AuthFeature } from '@toolman/shared'

import { AuthGuardModal } from './AuthGuardModal'

interface Props {
  open: boolean
  feature: AuthFeature
  message?: string
  onClose: () => void
  onRegister: () => void
}

function featureTitle(feature: AuthFeature): string {
  switch (feature) {
    case 'group':
      return '群组功能需要注册'
    case 'community_write':
      return '此操作需要注册'
    default:
      return '需要注册账户'
  }
}

const DEFAULT_MESSAGE =
  '注册并登录后可使用群组、发布内容、评论、安装资源等功能。'

export function RegistrationRequiredModal({
  open,
  feature,
  message,
  onClose,
  onRegister,
}: Props) {
  return (
    <AuthGuardModal
      isOpen={open}
      title={featureTitle(feature)}
      description={message ?? DEFAULT_MESSAGE}
      confirmText="去注册"
      cancelText="我知道了"
      onConfirm={onRegister}
      onCancel={onClose}
    />
  )
}
