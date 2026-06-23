import { AuthGuardModal } from '../user/AuthGuardModal'
import { formatGroupMemberLimitMessage } from '@toolman/shared'

interface Props {
  open: boolean
  maxMembers?: number
  onClose: () => void
  onUpgrade?: () => void
}

export function GroupMemberLimitModal({ open, maxMembers = 10, onClose, onUpgrade }: Props) {
  return (
    <AuthGuardModal
      isOpen={open}
      title="群组成员已达上限"
      description={formatGroupMemberLimitMessage(maxMembers)}
      confirmText="了解会员"
      cancelText="我知道了"
      onConfirm={onUpgrade ?? onClose}
      onCancel={onClose}
    />
  )
}
