import { AuthGuardModal } from '../user/AuthGuardModal'

interface Props {
  open: boolean
  activeCount: number
  maxMembers: number
  onClose: () => void
  onUpgrade?: () => void
}

export function GroupMemberLimitWarningModal({
  open,
  activeCount,
  maxMembers,
  onClose,
  onUpgrade,
}: Props) {
  return (
    <AuthGuardModal
      isOpen={open}
      title="群组即将达到社区版上限"
      description={`当前群组已有 ${activeCount}/${maxMembers} 名成员。社区版最多支持 ${maxMembers} 人协作；如需继续邀请成员，请升级专业版会员。`}
      confirmText="升级会员"
      cancelText="稍后提醒"
      onConfirm={onUpgrade ?? onClose}
      onCancel={onClose}
    />
  )
}
