import type { MobileCreatedKb } from '../storage/createdKnowledgeBases'
import type { KnowledgeMetaItem } from '../sync/mobileSync'
import type { KnowledgeCreateForm } from './KnowledgeCreateModal'
import type { KnowledgeFileItem, KnowledgeSidebarSection } from './knowledgeSidebar'

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
