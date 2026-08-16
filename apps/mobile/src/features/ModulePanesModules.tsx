import { Text, View } from 'react-native'
import type { MobileModuleId } from '../modules'
import { useMobileApp } from '../state/MobileAppContext'
import { shellStyles } from '../theme'
import { NotesLeftPane, NotesRightPane } from './ModulePanesNotes'
import { MODULE_COPY } from './notesPaneUtils'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'

export function ModuleLeftPane({
  moduleId,
}: {
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community' | 'projects'>
}) {
  const copy = MODULE_COPY[moduleId]
  const { setLeftOpen } = useMobileApp()

  if (moduleId === 'notes') {
    return <NotesLeftPane />
  }

  return (
    <SidebarShell>
      <SidebarAddButton
        label={copy.addLabel}
        onPress={() => {
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        <Text style={sidebarStyles.empty}>{copy.emptyHint}</Text>
      </SidebarList>
    </SidebarShell>
  )
}

/** Content-only modules (no chat). Agent-capable modules use `AgentRightPane` instead. */
export function ModuleRightPane({
  moduleId,
}: {
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community' | 'projects'>
}) {
  const copy = MODULE_COPY[moduleId]

  if (moduleId === 'notes') {
    return <NotesRightPane />
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={shellStyles.emptyHint}>{copy.hint}</Text>
    </View>
  )
}
