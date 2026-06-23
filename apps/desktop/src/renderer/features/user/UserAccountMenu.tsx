import { useRef, useState } from 'react'

import { UserCenterModal } from '../../components/user-center'
import { useUserAccount } from './useUserAccount'
import { getAvatarFallbackLabel, getDisplayInitial } from './user-avatar-utils'
import { isRegisteredUser } from './user-account-utils'

interface UserAccountMenuProps {
  className?: string
}

export function UserAccountMenu({ className }: UserAccountMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const account = useUserAccount()

  const identity = account.identity
  const avatarFallback =
    getAvatarFallbackLabel({ avatarUrl: identity?.avatarUrl }) ||
    getDisplayInitial(identity?.displayName ?? '')

  const initialView =
    isRegisteredUser(account.authSession) && account.isLoggedIn ? 'profile' : 'login'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={['tm-nav-avatar', className].filter(Boolean).join(' ')}
        title="用户账户"
        aria-label="用户账户"
        aria-expanded={open}
        onClick={() => {
          void account.load().catch(() => undefined)
          setOpen(true)
        }}
      >
        {identity?.avatarUrl ? (
          <img src={identity.avatarUrl} alt="" className="tm-nav-avatar-image" />
        ) : (
          avatarFallback
        )}
      </button>
      <UserCenterModal
        open={open}
        initialView={initialView}
        onClose={() => setOpen(false)}
        onSuccess={() => void account.load().catch(() => undefined)}
        successBehavior="profile"
        account={account}
      />
    </>
  )
}
