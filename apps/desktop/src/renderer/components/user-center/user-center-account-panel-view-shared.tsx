import { UserCenterAccountDeleteDialogs } from './UserCenterAccountDeleteDialogs'
import type { ProfileSubView } from './types'
import type { useUserCenterAccountPanel } from './useUserCenterAccountPanel'

export type AccountPanelState = ReturnType<typeof useUserCenterAccountPanel>

export type AccountPanelViewProps = {
  state: AccountPanelState
  onSubViewChange: (view: ProfileSubView) => void
}

export function AccountDeleteDialogs({ state }: { state: AccountPanelState }) {
  return (
    <UserCenterAccountDeleteDialogs
      account={state.account}
      authSession={state.authSession}
      showDeleteConfirm={state.showDeleteConfirm}
      showDeleteReauth={state.showDeleteReauth}
      onCloseConfirm={() => state.setShowDeleteConfirm(false)}
      onShowReauth={() => state.setShowDeleteReauth(true)}
      onCloseReauth={() => state.setShowDeleteReauth(false)}
    />
  )
}
