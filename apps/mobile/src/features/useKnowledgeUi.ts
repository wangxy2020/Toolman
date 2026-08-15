import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useMobileApp } from '../state/MobileAppContext'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import {
  createKnowledgeBaseId,
  loadCreatedKnowledgeBases,
  saveCreatedKnowledgeBases,
  type MobileCreatedKb,
} from '../storage/createdKnowledgeBases'
import { type KnowledgeMetaItem } from '../sync/mobileSync'
import { KnowledgeCreateModal, type KnowledgeCreateForm } from './KnowledgeCreateModal'
import {
  DEFAULT_FOLDER_LABEL,
  DEFAULT_SYNC_FOLDER_ID,
  defaultActiveKbId,
  formatFileSize,
  isSystemDefaultFolderName,
  listedSyncKnowledgeItems,
  mobileSyncKbUiId,
  type KnowledgeFileItem,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'

export type KnowledgeUiState = {
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
    modulePrefs,
    runSync,
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
    await runSync('manual')
  }, [modulePrefs.knowledge.syncEnabled, runSync])

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

  return createElement(
    KnowledgeUiContext.Provider,
    { value },
    children,
    createElement(KnowledgeCreateModal, {
      visible: createModalOpen,
      submitting: createSubmitting,
      onClose: () => setCreateModalOpen(false),
      onSubmit: createKnowledgeBase,
    }),
  )
}
