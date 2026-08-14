import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  createKnowledgeBaseId,
  loadCreatedKnowledgeBases,
  saveCreatedKnowledgeBases,
  type MobileCreatedKb,
} from '../storage/createdKnowledgeBases'
import { countDesktopHostsOnline, type KnowledgeMetaItem } from '../sync/mobileSync'
import { colors } from '../theme'
import { KnowledgeCreateModal, type KnowledgeCreateForm } from './KnowledgeCreateModal'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from './modulePageStatus'
import {
  DEFAULT_FOLDER_LABEL,
  DEFAULT_SYNC_FOLDER_ID,
  defaultActiveKbId,
  formatFileSize,
  getKnowledgeSection,
  isSystemDefaultFolderName,
  knowledgeBasesForSection,
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
  createdKbs: MobileCreatedKb[]
  refreshSyncedMeta: () => Promise<void>
  openCreateModal: () => void
  closeCreateModal: () => void
  createKnowledgeBase: (input: KnowledgeCreateForm) => void
  updateCreatedKnowledgeBase: (id: string, patch: Partial<MobileCreatedKb>) => void
}

const KnowledgeUiContext = createContext<KnowledgeUiState | null>(null)

export function useKnowledgeUi(): KnowledgeUiState {
  const ctx = useContext(KnowledgeUiContext)
  if (!ctx) throw new Error('useKnowledgeUi requires KnowledgeUiProvider')
  return ctx
}

export function useOptionalKnowledgeUi(): KnowledgeUiState | null {
  return useContext(KnowledgeUiContext)
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createdKbs, setCreatedKbs] = useState<MobileCreatedKb[]>([])
  const [expanded, setExpanded] = useState<Set<KnowledgeSidebarSection>>(
    () => new Set<KnowledgeSidebarSection>(['sync']),
  )

  const syncedKbs = listedSyncKnowledgeItems(knowledgeMeta.filter((item) => item.kind === 'sync'))
  const createdKbsReady = useRef(false)

  useEffect(() => {
    let cancelled = false
    void loadCreatedKnowledgeBases().then((items) => {
      if (cancelled) return
      createdKbsReady.current = true
      setCreatedKbs((prev) => {
        if (prev.length === 0) return items
        const existingIds = new Set(prev.map((kb) => kb.id))
        return [...prev, ...items.filter((kb) => !existingIds.has(kb.id))]
      })
      setDocumentsByKb((prev) => {
        const next = { ...prev }
        for (const kb of items) {
          if (next[kb.id]) continue
          if (kb.kind === 'network' && kb.networkUrl) {
            next[kb.id] = [
              {
                id: `url-${kb.id}`,
                title: kb.networkUrl,
                sizeLabel: 'URL',
                addedAt: kb.updatedAt,
                status: 'ready',
                sourceKind: 'url',
                absolutePath: kb.networkUrl,
              },
            ]
          } else {
            next[kb.id] = []
          }
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!createdKbsReady.current) return
    void saveCreatedKnowledgeBases(createdKbs)
  }, [createdKbs])

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

  const createKnowledgeBase = useCallback((input: KnowledgeCreateForm) => {
    const kb: MobileCreatedKb = {
      id: createKnowledgeBaseId(),
      name: input.name,
      kind: input.kind,
      description: input.description,
      networkUrl: input.networkUrl,
      updatedAt: Date.now(),
    }
    setCreateSubmitting(true)
    setCreatedKbs((prev) => [kb, ...prev])
    setActiveSection(input.kind)
    setActiveKbId(kb.id)
    setActiveKbName(kb.name)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(input.kind)
      return next
    })
    if (input.kind === 'network' && input.networkUrl) {
      setDocumentsByKb((prev) => ({
        ...prev,
        [kb.id]: [
          {
            id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            title: input.networkUrl!,
            sizeLabel: 'URL',
            addedAt: Date.now(),
            status: 'ready',
            sourceKind: 'url',
            absolutePath: input.networkUrl,
          },
          ...(prev[kb.id] ?? []),
        ],
      }))
    } else {
      setDocumentsByKb((prev) => ({ ...prev, [kb.id]: prev[kb.id] ?? [] }))
    }
    setImportError(null)
    setCreateModalOpen(false)
    setCreateSubmitting(false)
  }, [])

  const updateCreatedKnowledgeBase = useCallback((id: string, patch: Partial<MobileCreatedKb>) => {
    setCreatedKbs((prev) =>
      prev.map((kb) => (kb.id === id ? { ...kb, ...patch, updatedAt: Date.now() } : kb)),
    )
    if (typeof patch.name === 'string' && patch.name.trim()) {
      setActiveKbName((current) => (activeKbId === id ? patch.name!.trim() : current))
    }
    if (typeof patch.networkUrl === 'string' && patch.networkUrl.trim()) {
      const nextUrl = patch.networkUrl.trim()
      setDocumentsByKb((prev) => {
        const docs = prev[id] ?? []
        const nextDocs =
          docs.length === 0
            ? [
                {
                  id: `doc-${Date.now().toString(36)}`,
                  title: nextUrl,
                  sizeLabel: 'URL',
                  addedAt: Date.now(),
                  status: 'ready' as const,
                  sourceKind: 'url' as const,
                  absolutePath: nextUrl,
                },
              ]
            : docs.map((doc, index) =>
                index === 0 && doc.sourceKind === 'url'
                  ? { ...doc, title: nextUrl, absolutePath: nextUrl }
                  : doc,
              )
        return { ...prev, [id]: nextDocs }
      })
    }
  }, [activeKbId])

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
      createdKbs,
      refreshSyncedMeta,
      openCreateModal: () => setCreateModalOpen(true),
      closeCreateModal: () => setCreateModalOpen(false),
      createKnowledgeBase,
      updateCreatedKnowledgeBase,
    }),
    [
      activeKbId,
      activeKbName,
      activeSection,
      createdKbs,
      createKnowledgeBase,
      documentsByKb,
      expanded,
      importError,
      refreshSyncedMeta,
      syncedKbs,
      updateCreatedKnowledgeBase,
    ],
  )

  return (
    <KnowledgeUiContext.Provider value={value}>
      {children}
      <KnowledgeCreateModal
        visible={createModalOpen}
        submitting={createSubmitting}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={createKnowledgeBase}
      />
    </KnowledgeUiContext.Provider>
  )
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
  const section = getKnowledgeSection(activeSection)
  const documents = activeKbId ? (documentsByKb[activeKbId] ?? []) : []
  const canImport = Boolean(activeKbId) && section.showDropzone
  const pendingCount = documents.filter((item) => item.status === 'pending').length

  useRegisterModulePanelError('knowledge-import', importError, () => setImportError(null))
  useRegisterModulePanelStatus(
    'knowledge-ingest',
    pendingCount > 0
      ? { tone: 'info', message: `正在处理 ${pendingCount} 个文档…` }
      : null,
  )
  useRegisterModulePanelStatus(
    'knowledge-ready',
    importError || pendingCount > 0
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
