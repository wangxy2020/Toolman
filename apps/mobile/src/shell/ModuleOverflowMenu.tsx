import { useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isAgentChatScope, resolveAgentChatScope } from '../chat/agentScopes'
import { IconMoreHorizontal } from '../icons/nav-icons'
import type { MobileModuleId } from '../modules'
import type { SettingsTabId } from '../settings/tabs'
import { useMobileApp, type ChatSession } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'

type MenuItem = {
  id: string
  label: string
  onPress: () => void
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildMenuItems(options: {
  module: MobileModuleId
  showSettings: boolean
  openSettingsTab: (tab: SettingsTabId) => void
  closeSettings: () => void
  createAgentSession: () => void
  createNote: () => void
  openLeftPane: () => void
}): MenuItem[] {
  const {
    module,
    showSettings,
    openSettingsTab,
    closeSettings,
    createAgentSession,
    createNote,
    openLeftPane,
  } = options

  if (showSettings) {
    return [
      { id: 'user', label: '用户信息', onPress: () => openSettingsTab('user') },
      { id: 'system', label: '系统设置', onPress: () => openSettingsTab('system') },
      { id: 'close', label: '关闭设置', onPress: closeSettings },
    ]
  }

  if (isAgentChatScope(module)) {
    const settingsTab: SettingsTabId =
      module === 'agent' ? 'agent' : module === 'classroom' ? 'classroom' : 'projects'
    const settingsLabel =
      module === 'agent' ? '智能体设置' : module === 'classroom' ? '课堂设置' : '项目设置'
    return [
      { id: 'new-topic', label: '新建话题', onPress: createAgentSession },
      { id: 'settings', label: settingsLabel, onPress: () => openSettingsTab(settingsTab) },
    ]
  }

  switch (module) {
    case 'knowledge':
      return [
        { id: 'add-kb', label: '添加知识库', onPress: openLeftPane },
        { id: 'settings', label: '知识库设置', onPress: () => openSettingsTab('knowledge') },
      ]
    case 'notes':
      return [
        { id: 'new-note', label: '新建笔记', onPress: createNote },
        { id: 'settings', label: '笔记设置', onPress: () => openSettingsTab('notes') },
      ]
    case 'group':
      return [
        { id: 'create-group', label: '创建群组', onPress: openLeftPane },
        { id: 'settings', label: '群组设置', onPress: () => openSettingsTab('group') },
      ]
    case 'community':
      return [
        { id: 'explore', label: '探索社区', onPress: openLeftPane },
        { id: 'settings', label: '社区设置', onPress: () => openSettingsTab('community') },
      ]
    default:
      return [{ id: 'settings', label: '设置', onPress: () => openSettingsTab('system') }]
  }
}

/** Top-bar overflow menu; items depend on the active module / settings page. */
export function ModuleOverflowMenu() {
  const insets = useSafeAreaInsets()
  const {
    module,
    showSettings,
    setShowSettings,
    setSettingsTab,
    setLeftOpen,
    upsertSession,
    setActiveSessionId,
    notes,
    setNotes,
    notebooks,
    activeNoteId,
    setActiveNoteId,
  } = useMobileApp()
  const [open, setOpen] = useState(false)

  const items = useMemo(
    () =>
      buildMenuItems({
        module,
        showSettings,
        openSettingsTab: (tab) => {
          setSettingsTab(tab)
          setShowSettings(true)
          setLeftOpen(false)
        },
        closeSettings: () => {
          setShowSettings(false)
          setLeftOpen(false)
        },
        createAgentSession: () => {
          const agentScope = resolveAgentChatScope(module)
          const session: ChatSession = {
            id: newId('sess'),
            title: '新话题',
            updatedAt: Date.now(),
            messages: [],
            agentScope,
          }
          upsertSession(session)
          setActiveSessionId(session.id)
          setShowSettings(false)
          setLeftOpen(true)
        },
        createNote: () => {
          const id = `note-${Date.now().toString(36)}`
          const notebookId =
            notes.find((item) => item.id === activeNoteId)?.notebookId ??
            notebooks.find((item) => item.isDefault)?.id ??
            notebooks[0]?.id ??
            'notebook-default'
          setNotes([
            { id, notebookId, title: '新笔记', body: '', updatedAt: Date.now() },
            ...notes,
          ])
          setActiveNoteId(id)
          setShowSettings(false)
          setLeftOpen(false)
        },
        openLeftPane: () => {
          setShowSettings(false)
          setLeftOpen(true)
        },
      }),
    [
      module,
      notes,
      notebooks,
      activeNoteId,
      setActiveNoteId,
      setActiveSessionId,
      setLeftOpen,
      setNotes,
      setSettingsTab,
      setShowSettings,
      showSettings,
      upsertSession,
    ],
  )

  return (
    <>
      <Pressable
        style={[shellStyles.iconBtn, open ? shellStyles.iconBtnActive : null]}
        onPress={() => setOpen(true)}
        accessibilityLabel="功能菜单"
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
                <Text style={styles.menuItemLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
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
    minWidth: 168,
    maxWidth: 240,
    borderRadius: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
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
