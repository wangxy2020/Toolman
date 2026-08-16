import { Pressable, Text, TextInput, View } from 'react-native'
import type { MobileAuthSession } from '../auth/types'
import {
  IconApple,
  IconDouyin,
  IconGoogle,
  IconWechat,
} from '../icons/auth-social-icons'
import { colors } from '../theme'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  settingsUiStyles as styles,
} from './settingsUi'
import { SOCIAL_ITEMS, type SocialProvider } from './userSettingsUtils'
import {
  useGuestAuth,
  useLoggedInAccount,
  useUserSettingsPanel,
} from './useUserSettingsPanel'

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

