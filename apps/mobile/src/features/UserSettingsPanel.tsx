import { useUserSettingsPanel } from './useUserSettingsPanel'

import { GuestAuthPanel } from './UserSettingsGuestPanel'
import { LoggedInAccountPanel } from './UserSettingsAccountPanel'

export function UserSettingsPanel() {
  const { auth, setAuth, syncStatus, onSync } = useUserSettingsPanel()

  if (!auth) {
    return <GuestAuthPanel onSession={setAuth} />
  }

  return (
    <LoggedInAccountPanel
      auth={auth}
      setAuth={setAuth}
      syncStatus={syncStatus}
      onSync={onSync}
    />
  )
}
