import { useUserAccount } from './useUserAccount'
import { UserCenterModal } from '../../components/user-center'

interface Props {
  open: boolean
  onClose: () => void
}

/** @deprecated Change password is available in UserCenterModal profile view */
export function AuthChangePasswordModal({ open, onClose }: Props) {
  const account = useUserAccount()

  return (
    <UserCenterModal
      open={open}
      initialView="profile"
      initialProfileSubView="change_password"
      onClose={onClose}
      successBehavior="close"
      account={account}
    />
  )
}
