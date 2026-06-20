import { AuthGuardModal } from './AuthGuardModal'

interface Props {
  onDismiss?: () => void
  onRegister?: () => void
}

export function GroupRegistrationGate({ onDismiss, onRegister }: Props) {
  return (
    <AuthGuardModal
      isOpen
      title="群组功能需要注册"
      description="创建或加入群组、群聊与协作同步需要先注册并登录 Toolman 账户。"
      confirmText="去注册"
      cancelText="返回"
      onConfirm={() => onRegister?.()}
      onCancel={() => onDismiss?.()}
    />
  )
}
