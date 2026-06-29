import type { useUserAccount } from '../../features/user/useUserAccount'
import type { ProfileSubView } from './types'
import { useUserCenterAccountPanel } from './useUserCenterAccountPanel'
import {
  UserCenterAccountBindPhoneView,
  UserCenterAccountBindWechatView,
  UserCenterAccountChangePasswordView,
  UserCenterAccountGuestView,
  UserCenterAccountMainView,
  UserCenterAccountMembershipView,
  UserCenterAccountReloginView,
} from './UserCenterAccountPanelViews'

export { accountPanelSubtitle, accountPanelTitle } from './user-center-account-panel-titles'

interface UserCenterAccountPanelProps {
  account: ReturnType<typeof useUserAccount>
  subView: ProfileSubView
  onSubViewChange: (view: ProfileSubView) => void
  onSwitchToLogin: () => void
}

export function UserCenterAccountPanel({
  account,
  subView,
  onSubViewChange,
  onSwitchToLogin,
}: UserCenterAccountPanelProps) {
  const state = useUserCenterAccountPanel(account, onSubViewChange)

  if (subView === 'bind_phone') {
    return <UserCenterAccountBindPhoneView state={state} onSubViewChange={onSubViewChange} />
  }

  if (subView === 'bind_wechat') {
    return <UserCenterAccountBindWechatView state={state} onSubViewChange={onSubViewChange} />
  }

  if (subView === 'upgrade_membership') {
    return <UserCenterAccountMembershipView state={state} onSubViewChange={onSubViewChange} />
  }

  if (subView === 'change_password') {
    return <UserCenterAccountChangePasswordView state={state} onSubViewChange={onSubViewChange} />
  }

  if (!state.registered) {
    return <UserCenterAccountGuestView />
  }

  if (!account.isLoggedIn) {
    return <UserCenterAccountReloginView account={account} onSwitchToLogin={onSwitchToLogin} />
  }

  return <UserCenterAccountMainView state={state} onSubViewChange={onSubViewChange} />
}
