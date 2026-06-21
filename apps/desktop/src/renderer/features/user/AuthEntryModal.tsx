import { useUserAccount } from './useUserAccount'
import { UserCenterModal } from '../../components/user-center'
import type { AuthEntryMode } from './AuthEntryModal.types'

export type { AuthEntryMode } from './AuthEntryModal.types'

interface Props {
  open: boolean
  mode: AuthEntryMode
  onClose: () => void
  onSuccess?: () => void
}

/** @deprecated Use UserCenterModal directly */
export function AuthEntryModal({ open, mode, onClose, onSuccess }: Props) {
  const account = useUserAccount()

  return (
    <UserCenterModal
      open={open}
      initialView={mode}
      onClose={onClose}
      onSuccess={onSuccess}
      successBehavior="close"
      account={account}
    />
  )
}
