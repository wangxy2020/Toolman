import { AuthGuardModal } from '../user/AuthGuardModal'

interface Props {
  open: boolean
  onClose: () => void
  onUpgrade?: () => void
}

export function GroupMemberLimitModal({ open, onClose, onUpgrade }: Props) {
  return (
    <AuthGuardModal
      isOpen={open}
      title="群组成员已达上限"
      description="社区版群组最多支持 10 名成员。请开通会员服务以提升群组成员上限。"
      confirmText="了解会员"
      cancelText="我知道了"
      onConfirm={onUpgrade ?? onClose}
      onCancel={onClose}
    />
  )
}
