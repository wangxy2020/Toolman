import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { listDesktopKnowledgeMeta } from '../host/invokeDesktop'
import { useMobileApp } from '../state/MobileAppContext'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import { countDesktopHostsOnline, type KnowledgeMetaItem } from '../sync/mobileSync'
import { colors } from '../theme'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import {
  DEFAULT_FOLDER_LABEL,
  DEFAULT_SYNC_FOLDER_ID,
  defaultActiveKbId,
  formatFileSize,
  getKnowledgeSection,
  isSystemDefaultFolderName,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  listedSyncKnowledgeItems,
  mobileSyncKbUiId,
  type KnowledgeFileItem,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
} from './sidebarUi'

type KnowledgeUiState = {
  activeSection: KnowledgeSidebarSection
  setActiveSection: (section: KnowledgeSidebarSection) => void
  activeKbId: string | null
  setActiveKbId: (id: string | null) => void
  activeKbName: string | null
  documentsByKb: Record<string, KnowledgeFileItem[]>
  addDocuments: (kbId: string, items: KnowledgeFileItem[]) => void
  deleteDocument: (kbId: string, docId: string) => void
  reindexDocuments: (kbId: string, ids?: string[]) => void
  moveDocuments: (fromKbId: string, toKbId: string, ids: string[]) => void
  expanded: Set<KnowledgeSidebarSection>
  toggleExpanded: (section: KnowledgeSidebarSection) => void
  expandSection: (section: KnowledgeSidebarSection) => void
  selectSection: (section: KnowledgeSidebarSection) => void
  selectKb: (section: KnowledgeSidebarSection, kbId: string, kbName: string) => void
  importError: string | null
  setImportError: (message: string | null) => void
  syncedKbs: KnowledgeMetaItem[]
  refreshSyncedMeta: () => Promise<void>
}

const KnowledgeUiContext = createContext<KnowledgeUiState | null>(null)

function useKnowledgeUi(): KnowledgeUiState {
  const ctx = useContext(KnowledgeUiContext)
  if (!ctx) throw new Error('useKnowledgeUi requires KnowledgeUiProvider')
  return ctx
}

export function KnowledgeUiProvider({ children }: { children: ReactNode }) {
  const {
    knowledgeMeta,
    setKnowledgeMeta,
    modulePrefs,
    setDesktopHostsOnline,
  } = useMobileApp()
  const [activeSection, setActiveSection] = useState<KnowledgeSidebarSection>('sync')
  const [activeKbId, setActiveKbId] = useState<string | null>(() => defaultActiveKbId('sync'))
  const [activeKbName, setActiveKbName] = useState<string | null>(DEFAULT_FOLDER_LABEL)
  const [documentsByKb, setDocumentsByKb] = useState<Record<string, KnowledgeFileItem[]>>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<KnowledgeSidebarSection>>(
    () => new Set<KnowledgeSidebarSection>(['sync']),
  )

  const syncedKbs = listedSyncKnowledgeItems(knowledgeMeta.filter((item) => item.kind === 'sync'))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const snapshot = await loadKnowledgeSnapshot()
      if (cancelled || !snapshot) return
      const defaultSyncKbIds = new Set(
        snapshot.kbs
          .filter((kb) => kb.kind === 'sync' && isSystemDefaultFolderName(kb.name))
          .map((kb) => kb.id),
      )
      const uiKbId = (kbId: string) => (defaultSyncKbIds.has(kbId) ? DEFAULT_SYNC_FOLDER_ID : kbId)
      const next: Record<string, KnowledgeFileItem[]> = {}
      for (const doc of snapshot.documents) {
        const file = snapshot.files.find(
          (item) => item.documentId === doc.id && item.kbId === doc.kbId,
        )
        const kbId = uiKbId(doc.kbId)
        const list = next[kbId] ?? []
        list.push({
          id: doc.id,
          title: doc.title,
          sizeLabel: formatFileSize(file?.sizeBytes ?? doc.sizeBytes ?? 0),
          addedAt: doc.updatedAt,
          status: doc.status === 'ready' ? 'ready' : 'pending',
          sourceKind: doc.sourceKind,
        })
        next[kbId] = list
      }
      setDocumentsByKb((prev) => {
        const snapshotUiKbIds = new Set(snapshot.kbs.map((kb) => mobileSyncKbUiId(kb)))
        const staleIds = new Set([...snapshotUiKbIds, ...defaultSyncKbIds])
        const kept = Object.fromEntries(
          Object.entries(prev).filter(([id]) => !staleIds.has(id)),
        )
        return { ...kept, ...next }
      })
    })()
    return () => {
      cancelled = true
    }
  }, [knowledgeMeta])

  const refreshSyncedMeta = useCallback(async () => {
    if (!modulePrefs.knowledge.syncEnabled) return
    try {
      const hostsOnline = await countDesktopHostsOnline()
      setDesktopHostsOnline(hostsOnline)
      if (hostsOnline <= 0) return
      const items = await listDesktopKnowledgeMeta()
      setKnowledgeMeta(
        listedSyncKnowledgeItems(
          items
            .filter((item) => item.kind === 'sync')
            .map((item) => ({
              id: item.id,
              name: item.name,
              kind: 'sync',
              documentCount: item.documentCount,
              updatedAt: item.updatedAt ?? Date.now(),
            })),
        ),
      )
    } catch {
      // Keep last pull; search may still work if host comes back.
    }
  }, [modulePrefs.knowledge.syncEnabled, setDesktopHostsOnline, setKnowledgeMeta])

  useEffect(() => {
    void refreshSyncedMeta()
  }, [refreshSyncedMeta])

  const value = useMemo<KnowledgeUiState>(
    () => ({
      activeSection,
      setActiveSection,
      activeKbId,
      setActiveKbId,
      activeKbName,
      documentsByKb,
      addDocuments: (kbId, items) => {
        setDocumentsByKb((prev) => ({
          ...prev,
          [kbId]: [...items, ...(prev[kbId] ?? [])],
        }))
        setImportError(null)
      },
      deleteDocument: (kbId, docId) => {
        setDocumentsByKb((prev) => ({
          ...prev,
          [kbId]: (prev[kbId] ?? []).filter((item) => item.id !== docId),
        }))
      },
      reindexDocuments: (kbId, ids) => {
        const match = (id: string) => !ids || ids.includes(id)
        setDocumentsByKb((prev) => ({
          ...prev,
          [kbId]: (prev[kbId] ?? []).map((item) =>
            match(item.id) ? { ...item, status: 'pending' } : item,
          ),
        }))
        setTimeout(() => {
          setDocumentsByKb((prev) => ({
            ...prev,
            [kbId]: (prev[kbId] ?? []).map((item) =>
              match(item.id) ? { ...item, status: 'ready' } : item,
            ),
          }))
        }, 800)
      },
      moveDocuments: (fromKbId, toKbId, ids) => {
        if (fromKbId === toKbId || ids.length === 0) return
        setDocumentsByKb((prev) => {
          const moving = (prev[fromKbId] ?? []).filter((item) => ids.includes(item.id))
          if (moving.length === 0) return prev
          return {
            ...prev,
            [fromKbId]: (prev[fromKbId] ?? []).filter((item) => !ids.includes(item.id)),
            [toKbId]: [...moving, ...(prev[toKbId] ?? [])],
          }
        })
      },
      expanded,
      toggleExpanded: (section) => {
        setExpanded((prev) => {
          const next = new Set(prev)
          if (next.has(section)) next.delete(section)
          else next.add(section)
          return next
        })
      },
      expandSection: (section) => {
        setExpanded((prev) => {
          if (prev.has(section)) return prev
          const next = new Set(prev)
          next.add(section)
          return next
        })
      },
      selectSection: (section) => {
        setActiveSection(section)
        const defaultId = defaultActiveKbId(section)
        setActiveKbId(defaultId)
        setActiveKbName(defaultId ? DEFAULT_FOLDER_LABEL : null)
        setExpanded((prev) => {
          if (prev.has(section)) return prev
          const next = new Set(prev)
          next.add(section)
          return next
        })
        setImportError(null)
      },
      selectKb: (section, kbId, kbName) => {
        setActiveSection(section)
        setActiveKbId(kbId)
        setActiveKbName(kbName)
        setExpanded((prev) => {
          if (prev.has(section)) return prev
          const next = new Set(prev)
          next.add(section)
          return next
        })
        setImportError(null)
      },
      importError,
      setImportError,
      syncedKbs,
      refreshSyncedMeta,
    }),
    [
      activeKbId,
      activeKbName,
      activeSection,
      documentsByKb,
      expanded,
      importError,
      refreshSyncedMeta,
      syncedKbs,
    ],
  )

  return <KnowledgeUiContext.Provider value={value}>{children}</KnowledgeUiContext.Provider>
}

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
  } = useKnowledgeUi()

  const kbsForSection = (sectionId: KnowledgeSidebarSection) => {
    // Desktop knowledge bases always appear under「同步知识库」only.
    if (sectionId === 'sync') return syncedKbs
    return []
  }

  return (
    <SidebarShell>
      <SidebarAddButton
        label="添加知识库"
        onPress={() => {
          setLeftOpen(false)
        }}
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
  } = useKnowledgeUi()
  const section = getKnowledgeSection(activeSection)
  const documents = activeKbId ? (documentsByKb[activeKbId] ?? []) : []
  const canImport = Boolean(activeKbId) && section.showDropzone

  return (
    <View style={styles.rightRoot}>
      {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
      <KnowledgeFilePanel
        documents={documents}
        mode={section.importMode}
        showDropzone
        importDisabled={!canImport}
        listKey={activeKbId}
        syncMoveTargets={syncedKbs.map((kb) => ({ id: kb.id, name: kb.name }))}
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
  errorText: {
    marginHorizontal: 20,
    marginTop: 10,
    fontSize: 12,
    color: colors.danger,
  },
})
