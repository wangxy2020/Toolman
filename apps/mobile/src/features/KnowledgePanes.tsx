import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from './modulePageStatus'
import {
  DEFAULT_FOLDER_LABEL,
  DEFAULT_SYNC_FOLDER_ID,
  getKnowledgeSection,
  knowledgeBasesForSection,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
} from './sidebarUi'
import { useKnowledgeUi } from './useKnowledgeUi'

export { useKnowledgeUi, useOptionalKnowledgeUi, KnowledgeUiProvider } from './useKnowledgeUi'
export type { KnowledgeUiState } from './useKnowledgeUi'

function SectionChevron({ open }: { open: boolean }) {
  return (
    <Text style={[styles.chevron, open ? styles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

function IconFolder({ size = 14, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function KnowledgeSidebarKbItem(props: {
  label: string
  meta?: string
  active?: boolean
  onPress: () => void
}) {
  const active = Boolean(props.active)
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.kbItem,
        active ? styles.kbItemActive : null,
        pressed && !active ? styles.kbItemPressed : null,
      ]}
    >
      <View style={styles.kbItemIcon}>
        <IconFolder size={14} color={colors.textSecondary} />
      </View>
      <View style={styles.kbItemText}>
        <Text
          style={[styles.kbItemLabel, active ? styles.kbItemLabelActive : null]}
          numberOfLines={1}
        >
          {props.label}
        </Text>
        {props.meta ? (
          <Text style={styles.kbItemMeta} numberOfLines={1}>
            {props.meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export function KnowledgeLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const {
    activeSection,
    activeKbId,
    expanded,
    toggleExpanded,
    selectSection,
    selectKb,
    syncedKbs,
    createdKbs,
    openCreateModal,
  } = useKnowledgeUi()

  const kbsForSection = (sectionId: KnowledgeSidebarSection) =>
    knowledgeBasesForSection(sectionId, createdKbs, syncedKbs)

  return (
    <SidebarShell>
      <SidebarAddButton
        label="添加知识库"
        onPress={openCreateModal}
      />
      <SidebarList>
        {KNOWLEDGE_SIDEBAR_SECTIONS.map((section) => {
          const isOpen = expanded.has(section.id)
          const isActive = activeSection === section.id
          const remoteKbs = kbsForSection(section.id)
          return (
            <View key={section.id} style={styles.group}>
              <View style={[styles.sectionRow, isActive ? styles.sectionRowActive : null]}>
                <Pressable
                  accessibilityLabel={isOpen ? '折叠' : '展开'}
                  onPress={() => toggleExpanded(section.id)}
                  style={({ pressed }) => [
                    styles.expandHit,
                    pressed ? styles.expandHitPressed : null,
                  ]}
                >
                  <SectionChevron open={isOpen} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => selectSection(section.id)}
                  style={styles.sectionNameHit}
                >
                  <Text
                    style={[styles.sectionName, isActive ? styles.sectionNameActive : null]}
                    numberOfLines={1}
                  >
                    {section.label}
                  </Text>
                </Pressable>
              </View>
              {isOpen ? (
                <View style={styles.sectionBody}>
                  {section.defaultFolderId ? (
                    <KnowledgeSidebarKbItem
                      label={DEFAULT_FOLDER_LABEL}
                      active={
                        activeSection === section.id && activeKbId === section.defaultFolderId
                      }
                      onPress={() => {
                        selectKb(section.id, section.defaultFolderId!, DEFAULT_FOLDER_LABEL)
                        setLeftOpen(false)
                      }}
                    />
                  ) : null}
                  {remoteKbs.map((kb) => (
                    <KnowledgeSidebarKbItem
                      key={kb.id}
                      label={kb.name}
                      active={activeSection === section.id && activeKbId === kb.id}
                      onPress={() => {
                        selectKb(section.id, kb.id, kb.name)
                        setLeftOpen(false)
                      }}
                    />
                  ))}
                  {section.id === 'shared' &&
                  !section.defaultFolderId &&
                  remoteKbs.length === 0 ? (
                    <Text style={styles.sectionEmpty}>{section.emptyHint}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )
        })}
      </SidebarList>
    </SidebarShell>
  )
}

export function KnowledgeRightPane() {
  const {
    activeSection,
    activeKbId,
    documentsByKb,
    addDocuments,
    deleteDocument,
    reindexDocuments,
    moveDocuments,
    importError,
    setImportError,
    syncedKbs,
    createdKbs,
  } = useKnowledgeUi()
  const { syncStatus } = useMobileApp()
  const section = getKnowledgeSection(activeSection)
  const documents = activeKbId ? (documentsByKb[activeKbId] ?? []) : []
  const canImport = Boolean(activeKbId) && section.showDropzone
  const pendingCount = documents.filter((item) => item.status === 'pending').length

  useRegisterModulePanelError('knowledge-import', importError, () => setImportError(null))
  useRegisterModulePanelStatus(
    'knowledge-sync',
    syncStatus === 'syncing'
      ? { tone: 'info', message: '正在同步知识库…' }
      : syncStatus === 'offline'
        ? { tone: 'warning', message: '未连接桌面，知识库仅保存在本地' }
        : syncStatus === 'error'
          ? { tone: 'error', message: '知识库同步失败' }
          : null,
  )
  useRegisterModulePanelStatus(
    'knowledge-ingest',
    pendingCount > 0
      ? { tone: 'info', message: `正在处理 ${pendingCount} 个文档…` }
      : null,
  )
  useRegisterModulePanelStatus(
    'knowledge-ready',
    importError ||
    pendingCount > 0 ||
    syncStatus === 'syncing' ||
    syncStatus === 'error' ||
    syncStatus === 'offline'
      ? null
      : {
          tone: 'muted',
          message: '就绪',
          meta: activeKbId ? `${documents.length} 个文档` : undefined,
        },
  )

  return (
    <View style={styles.rightRoot}>
      <KnowledgeFilePanel
        documents={documents}
        mode={section.importMode}
        showDropzone
        importDisabled={!canImport}
        listKey={activeKbId}
        syncMoveTargets={[
          ...createdKbs
            .filter((kb) => kb.kind === 'sync')
            .map((kb) => ({ id: kb.id, name: kb.name })),
          ...syncedKbs
            .filter((kb) => !createdKbs.some((created) => created.id === kb.id))
            .map((kb) => ({ id: kb.id, name: kb.name })),
        ]}
        onImportFiles={(items) => {
          if (!activeKbId) return
          addDocuments(activeKbId, items)
        }}
        onDeleteDocument={(id) => {
          if (!activeKbId) return
          deleteDocument(activeKbId, id)
        }}
        onReindexDocument={(id) => {
          if (!activeKbId) return
          reindexDocuments(activeKbId, [id])
        }}
        onReindexAll={() => {
          if (!activeKbId) return
          reindexDocuments(activeKbId)
        }}
        onMoveToSync={(ids, target) => {
          if (!activeKbId) return
          const destId = target.type === 'default' ? DEFAULT_SYNC_FOLDER_ID : target.kbId
          moveDocuments(activeKbId, destId, ids)
        }}
        onImportError={setImportError}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 2,
  },
  sectionRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionRowActive: {
    // Match desktop `.tm-assistant-row--active` → `--tm-hover`
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  sectionNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  sectionName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  sectionNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  sectionBody: {
    paddingBottom: 2,
  },
  sectionEmpty: {
    marginLeft: 34,
    marginRight: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
  },
  kbItem: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  kbItemActive: {
    backgroundColor: colors.accentSoft,
  },
  kbItemPressed: {
    backgroundColor: colors.hover,
  },
  kbItemIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kbItemText: {
    flex: 1,
    minWidth: 0,
  },
  kbItemLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  kbItemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
  kbItemMeta: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    opacity: 0.85,
  },
  rightRoot: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
})
