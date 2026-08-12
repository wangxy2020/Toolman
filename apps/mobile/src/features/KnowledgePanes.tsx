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
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { listDesktopKnowledgeMeta, searchDesktopKnowledge } from '../host/invokeDesktop'
import { useMobileApp } from '../state/MobileAppContext'
import { countDesktopHostsOnline, type KnowledgeMetaItem } from '../sync/mobileSync'
import { colors } from '../theme'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import {
  DEFAULT_FOLDER_LABEL,
  defaultActiveKbId,
  getKnowledgeSection,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  type KnowledgeFileItem,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
} from './sidebarUi'

type SearchHit = {
  documentTitle: string
  kbName: string
  score: number
  text: string
  sourcePath?: string | null
}

type KnowledgeUiState = {
  activeSection: KnowledgeSidebarSection
  setActiveSection: (section: KnowledgeSidebarSection) => void
  activeKbId: string | null
  setActiveKbId: (id: string | null) => void
  activeKbName: string | null
  documentsByKb: Record<string, KnowledgeFileItem[]>
  addDocuments: (kbId: string, items: KnowledgeFileItem[]) => void
  deleteDocument: (kbId: string, docId: string) => void
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
  const [activeSection, setActiveSection] = useState<KnowledgeSidebarSection>('local')
  const [activeKbId, setActiveKbId] = useState<string | null>(() => defaultActiveKbId('local'))
  const [activeKbName, setActiveKbName] = useState<string | null>(DEFAULT_FOLDER_LABEL)
  const [documentsByKb, setDocumentsByKb] = useState<Record<string, KnowledgeFileItem[]>>({})
  const [importError, setImportError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<KnowledgeSidebarSection>>(
    () => new Set<KnowledgeSidebarSection>(['local', 'sync']),
  )

  const syncedKbs = knowledgeMeta

  const refreshSyncedMeta = useCallback(async () => {
    if (!modulePrefs.knowledge.syncEnabled) return
    try {
      const hostsOnline = await countDesktopHostsOnline()
      setDesktopHostsOnline(hostsOnline)
      if (hostsOnline <= 0) return
      const items = await listDesktopKnowledgeMeta()
      setKnowledgeMeta(
        items.map((item) => ({
          id: item.id,
          name: item.name,
          kind: typeof item.kind === 'string' ? item.kind : 'local',
          documentCount: item.documentCount,
          updatedAt: item.updatedAt ?? Date.now(),
        })),
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
                  {section.id !== 'sync' && section.defaultFolderId ? (
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
                      meta={`${kb.documentCount} 篇`}
                      active={activeSection === section.id && activeKbId === kb.id}
                      onPress={() => {
                        selectKb(section.id, kb.id, kb.name)
                        setLeftOpen(false)
                      }}
                    />
                  ))}
                  {section.id === 'sync' && remoteKbs.length === 0 ? (
                    <Text style={styles.sectionEmpty}>{section.emptyHint}</Text>
                  ) : null}
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

function KnowledgeHostSearchPanel(props: {
  kbId: string | null
  kbName: string | null
}) {
  const { modulePrefs, setDesktopHostsOnline } = useMobileApp()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hits, setHits] = useState<SearchHit[]>([])

  const runSearch = async () => {
    const text = query.trim()
    if (!text) return
    if (!modulePrefs.knowledge.preferDesktopIndex) {
      setError('请在设置中开启「优先桌面索引」')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const hostsOnline = await countDesktopHostsOnline()
      setDesktopHostsOnline(hostsOnline)
      const items = await searchDesktopKnowledge({
        query: text,
        kbId: props.kbId ?? undefined,
        limit: 8,
      })
      setHits(items)
    } catch (err) {
      setHits([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.searchPanel}>
      <Text style={styles.searchTitle}>桌面检索{props.kbName ? ` · ${props.kbName}` : ''}</Text>
      <Text style={styles.searchHint}>向量与全文索引留在桌面；移动端通过宿主中继查询片段。</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索知识库…"
          placeholderTextColor={colors.textSecondary}
          style={styles.searchInput}
          onSubmitEditing={() => {
            void runSearch()
          }}
          returnKeyType="search"
        />
        <Pressable
          onPress={() => {
            void runSearch()
          }}
          style={({ pressed }) => [styles.searchBtn, pressed ? styles.searchBtnPressed : null]}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.searchBtnLabel}>搜索</Text>
          )}
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView style={styles.hitsScroll} contentContainerStyle={styles.hitsContent}>
        {hits.length === 0 && !busy && !error ? (
          <Text style={styles.emptyHint}>输入关键词后从桌面索引检索。</Text>
        ) : null}
        {hits.map((hit, index) => (
          <View key={`${hit.documentTitle}-${index}`} style={styles.hitCard}>
            <Text style={styles.hitTitle} numberOfLines={1}>
              {hit.documentTitle}
            </Text>
            <Text style={styles.hitMeta} numberOfLines={1}>
              {hit.kbName} · {(hit.score * 100).toFixed(0)}%
            </Text>
            <Text style={styles.hitBody}>{hit.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

export function KnowledgeRightPane() {
  const {
    activeSection,
    activeKbId,
    activeKbName,
    documentsByKb,
    addDocuments,
    deleteDocument,
    importError,
    setImportError,
    syncedKbs,
  } = useKnowledgeUi()
  const section = getKnowledgeSection(activeSection)
  const documents = activeKbId ? (documentsByKb[activeKbId] ?? []) : []
  const canImport = Boolean(activeKbId) && section.showDropzone
  const isSyncedKb = Boolean(activeKbId && syncedKbs.some((item) => item.id === activeKbId))
  const showHostSearch = activeSection === 'sync' || isSyncedKb

  return (
    <View style={styles.rightRoot}>
      {!activeKbId && activeSection !== 'sync' ? (
        <View style={styles.emptyPane}>
          <Text style={styles.emptyTitle}>{section.label}</Text>
          <Text style={styles.emptyHint}>{section.hint}</Text>
          <Text style={styles.emptyHint}>{section.emptyHint}</Text>
        </View>
      ) : showHostSearch ? (
        <KnowledgeHostSearchPanel
          kbId={isSyncedKb ? activeKbId : null}
          kbName={isSyncedKb ? activeKbName : null}
        />
      ) : (
        <>
          {importError ? <Text style={styles.errorText}>{importError}</Text> : null}
          <KnowledgeFilePanel
            documents={documents}
            mode={section.importMode}
            showDropzone={section.showDropzone}
            importDisabled={!canImport}
            onImportFiles={(items) => {
              if (!activeKbId) return
              addDocuments(activeKbId, items)
            }}
            onDeleteDocument={(id) => {
              if (!activeKbId) return
              deleteDocument(activeKbId, id)
            }}
            onImportError={setImportError}
          />
        </>
      )}
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
  emptyPane: {
    flex: 1,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    marginHorizontal: 20,
    marginTop: 10,
    fontSize: 12,
    color: colors.danger,
  },
  searchPanel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  searchTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  searchHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  searchBtn: {
    minWidth: 64,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 12,
  },
  searchBtnPressed: {
    opacity: 0.85,
  },
  searchBtnLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  hitsScroll: {
    flex: 1,
    minHeight: 0,
  },
  hitsContent: {
    paddingBottom: 24,
    gap: 10,
  },
  hitCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    backgroundColor: colors.inputBg,
  },
  hitTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hitMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  hitBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
})
