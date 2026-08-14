import { useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAgentChatScope } from '../chat/agentScopes'
import { AgentSettingsModal } from '../features/AgentSettingsModal'
import { CommunitySettingsModal } from '../features/CommunitySettingsModal'
import { KnowledgeSettingsModal } from '../features/KnowledgeSettingsModal'
import { NotesSettingsModal } from '../features/NotesSettingsModal'
import { ProjectSettingsModal } from '../features/ProjectSettingsModal'
import { useOptionalClassroomUi } from '../features/ClassroomPanes'
import { useOptionalGroupChat } from '../features/GroupPanes'
import { IconMoreHorizontal } from '../icons/nav-icons'
import { useI18n } from '../i18n'
import type { MobileModuleId } from '../modules'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'

type MenuItem = {
  id: string
  label: string
  onPress: () => void
}

function buildMenuItems(options: {
  module: MobileModuleId
  showSettings: boolean
  closeSettings: () => void
  openClassroomSettings: () => void
  openClassroomRecords: () => void
  openGroupSettings: () => void
  openAgentSettings: () => void
  openKnowledgeSettings: () => void
  openNotesSettings: () => void
  openCommunitySettings: () => void
  openProjectSettings: () => void
  closeLabel: string
  classroomRecordsLabel: string
  courseSettingsLabel: string
  agentSettingsLabel: string
  groupSettingsLabel: string
  knowledgeSettingsLabel: string
  notesSettingsLabel: string
  communitySettingsLabel: string
  projectSettingsLabel: string
}): MenuItem[] {
  const {
    module,
    showSettings,
    closeSettings,
    openClassroomSettings,
    openClassroomRecords,
    openGroupSettings,
    openAgentSettings,
    openKnowledgeSettings,
    openNotesSettings,
    openCommunitySettings,
    openProjectSettings,
    closeLabel,
    classroomRecordsLabel,
    courseSettingsLabel,
    agentSettingsLabel,
    groupSettingsLabel,
    knowledgeSettingsLabel,
    notesSettingsLabel,
    communitySettingsLabel,
    projectSettingsLabel,
  } = options

  if (showSettings) {
    return [{ id: 'close', label: closeLabel, onPress: closeSettings }]
  }

  if (module === 'classroom') {
    return [
      { id: 'records', label: classroomRecordsLabel, onPress: openClassroomRecords },
      { id: 'settings', label: courseSettingsLabel, onPress: openClassroomSettings },
    ]
  }

  if (module === 'group') {
    return [{ id: 'settings', label: groupSettingsLabel, onPress: openGroupSettings }]
  }

  if (module === 'knowledge') {
    return [{ id: 'settings', label: knowledgeSettingsLabel, onPress: openKnowledgeSettings }]
  }

  if (module === 'notes') {
    return [{ id: 'settings', label: notesSettingsLabel, onPress: openNotesSettings }]
  }

  if (module === 'community') {
    return [{ id: 'settings', label: communitySettingsLabel, onPress: openCommunitySettings }]
  }

  if (module === 'projects') {
    return [{ id: 'settings', label: projectSettingsLabel, onPress: openProjectSettings }]
  }

  if (isAgentChatScope(module)) {
    return [{ id: 'settings', label: agentSettingsLabel, onPress: openAgentSettings }]
  }

  return []
}

/** Top-bar overflow menu; items depend on the active module / settings page. */
export function ModuleOverflowMenu() {
  const insets = useSafeAreaInsets()
  const {
    module,
    showSettings,
    setShowSettings,
    setLeftOpen,
  } = useMobileApp()
  const [open, setOpen] = useState(false)
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false)
  const [knowledgeSettingsOpen, setKnowledgeSettingsOpen] = useState(false)
  const [notesSettingsOpen, setNotesSettingsOpen] = useState(false)
  const [communitySettingsOpen, setCommunitySettingsOpen] = useState(false)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const groupChat = useOptionalGroupChat()
  const classroomUi = useOptionalClassroomUi()
  const { t } = useI18n()

  const items = useMemo(
    () =>
      buildMenuItems({
        module,
        showSettings,
        closeLabel: t('settings.close'),
        classroomRecordsLabel: t('overflow.classroomRecords'),
        courseSettingsLabel: t('overflow.courseSettings'),
        agentSettingsLabel: t('overflow.agentSettings'),
        groupSettingsLabel: t('overflow.groupSettings'),
        knowledgeSettingsLabel: t('overflow.knowledgeSettings'),
        notesSettingsLabel: t('overflow.notesSettings'),
        communitySettingsLabel: t('overflow.communitySettings'),
        projectSettingsLabel: t('overflow.projectSettings'),
        closeSettings: () => {
          setShowSettings(false)
          setLeftOpen(false)
        },
        openClassroomSettings: () => {
          setShowSettings(false)
          setLeftOpen(false)
          classroomUi?.openCourseSettings()
        },
        openClassroomRecords: () => {
          setShowSettings(false)
          setLeftOpen(false)
          classroomUi?.openRecords()
        },
        openGroupSettings: () => {
          setShowSettings(false)
          setLeftOpen(false)
          groupChat?.openSettingsModal()
        },
        openAgentSettings: () => {
          setShowSettings(false)
          setLeftOpen(false)
          setAgentSettingsOpen(true)
        },
        openKnowledgeSettings: () => {
          setLeftOpen(false)
          setKnowledgeSettingsOpen(true)
        },
        openNotesSettings: () => {
          setLeftOpen(false)
          setNotesSettingsOpen(true)
        },
        openCommunitySettings: () => {
          setLeftOpen(false)
          setCommunitySettingsOpen(true)
        },
        openProjectSettings: () => {
          setLeftOpen(false)
          setProjectSettingsOpen(true)
        },
      }),
    [
      classroomUi,
      groupChat,
      module,
      setLeftOpen,
      setShowSettings,
      showSettings,
      t,
    ],
  )

  if (items.length === 0) return null

  return (
    <>
      <Pressable
        style={[shellStyles.iconBtn, open ? shellStyles.iconBtnActive : null]}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('shell.moreMenu')}
        hitSlop={8}
      >
        <IconMoreHorizontal size={18} color={open ? colors.accent : colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.overlay, { paddingTop: insets.top + 48 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.menu}>
            {items.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setOpen(false)
                  item.onPress()
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  index < items.length - 1 ? styles.menuItemBorder : null,
                  pressed ? styles.menuItemPressed : null,
                ]}
              >
                <Text style={styles.menuItemLabel} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
      <AgentSettingsModal visible={agentSettingsOpen} onClose={() => setAgentSettingsOpen(false)} />
      <KnowledgeSettingsModal
        visible={knowledgeSettingsOpen}
        onClose={() => setKnowledgeSettingsOpen(false)}
      />
      <NotesSettingsModal visible={notesSettingsOpen} onClose={() => setNotesSettingsOpen(false)} />
      <CommunitySettingsModal
        visible={communitySettingsOpen}
        onClose={() => setCommunitySettingsOpen(false)}
      />
      <ProjectSettingsModal
        visible={projectSettingsOpen}
        onClose={() => setProjectSettingsOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  menu: {
    alignSelf: 'flex-end',
    minWidth: 132,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  menuItemPressed: {
    backgroundColor: colors.hover,
  },
  menuItemLabel: {
    fontSize: 14,
    color: colors.text,
  },
})
