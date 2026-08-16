import {
  createElement,
  useCallback,
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
import { KnowledgeCreateModal, type KnowledgeCreateForm } from './KnowledgeCreateModal'
import {
  DEFAULT_FOLDER_LABEL,
  defaultActiveKbId,
  listedSyncKnowledgeItems,
  type KnowledgeFileItem,
  type KnowledgeSidebarSection,
} from './knowledgeSidebar'
import {
  applyNetworkUrlDocs,
  buildDocumentOps,
  mergeSnapshotDocuments,
  seedDocsFromCreatedKbs,
} from './useKnowledgeUi-docs'
import type { KnowledgeUiState } from './useKnowledgeUi-types'
import { KnowledgeUiContext } from './useKnowledgeUi-context'

export function KnowledgeUiProvider({ children }: { children: ReactNode }) {
  const { auth, knowledgeMeta, modulePrefs, runSync } = useMobileApp()
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
    createdKbsReady.current = false
    setCreatedKbs([])
    setDocumentsByKb({})
    void loadCreatedKnowledgeBases().then((items) => {
      if (cancelled) return
      createdKbsReady.current = true
      setCreatedKbs(items)
      setDocumentsByKb((prev) => seedDocsFromCreatedKbs(items, prev))
    })
    return () => {
      cancelled = true
    }
  }, [auth?.identityId])

  useEffect(() => {
    if (!createdKbsReady.current) return
    void saveCreatedKnowledgeBases(createdKbs)
  }, [createdKbs])

  useEffect(() => {
    let cancelled = false
    setDocumentsByKb({})
    void (async () => {
      const snapshot = await loadKnowledgeSnapshot()
      if (cancelled || !snapshot) return
      setDocumentsByKb((prev) => mergeSnapshotDocuments(snapshot, prev))
    })()
    return () => {
      cancelled = true
    }
  }, [auth?.identityId, knowledgeMeta])

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

  const updateCreatedKnowledgeBase = useCallback(
    (id: string, patch: Partial<MobileCreatedKb>) => {
      setCreatedKbs((prev) =>
        prev.map((kb) => (kb.id === id ? { ...kb, ...patch, updatedAt: Date.now() } : kb)),
      )
      if (typeof patch.name === 'string' && patch.name.trim()) {
        setActiveKbName((current) => (activeKbId === id ? patch.name!.trim() : current))
      }
      if (typeof patch.networkUrl === 'string' && patch.networkUrl.trim()) {
        const nextUrl = patch.networkUrl.trim()
        setDocumentsByKb((prev) => applyNetworkUrlDocs(prev, id, nextUrl))
      }
    },
    [activeKbId],
  )

  const docOps = useMemo(
    () => buildDocumentOps(setDocumentsByKb, setImportError),
    [],
  )

  const value = useMemo<KnowledgeUiState>(
    () => ({
      activeSection,
      setActiveSection,
      activeKbId,
      setActiveKbId,
      activeKbName,
      documentsByKb,
      ...docOps,
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
      docOps,
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
