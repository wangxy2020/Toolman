export type KnowledgeSidebarSection = 'local' | 'network' | 'sync' | 'shared'

export type KnowledgeImportMode = 'file' | 'url'

export const DEFAULT_LOCAL_FOLDER_ID = '__default_knowledge_folder__'
export const DEFAULT_NETWORK_FOLDER_ID = '__default_network_knowledge_folder__'
export const DEFAULT_SYNC_FOLDER_ID = '__default_sync_knowledge_folder__'

export type KnowledgeFileItem = {
  id: string
  title: string
  sizeLabel: string
  addedAt: number
  status: 'ready' | 'pending'
  sourceKind: 'file' | 'url'
  absolutePath?: string
}

export const KNOWLEDGE_SIDEBAR_SECTIONS: Array<{
  id: KnowledgeSidebarSection
  label: string
  hint: string
  emptyHint: string
  /** Default folder row under the section; shared has none until copies exist. */
  defaultFolderId: string | null
  importMode: KnowledgeImportMode
  showDropzone: boolean
}> = [
  {
    id: 'sync',
    label: '同步知识库',
    hint: '与桌面同步的知识库：打开应用时同步一次，之后约每 3 分钟检查有变化的文档。',
    emptyHint: '暂无同步知识库',
    defaultFolderId: DEFAULT_SYNC_FOLDER_ID,
    importMode: 'file',
    showDropzone: true,
  },
  {
    id: 'local',
    label: '本地知识库',
    hint: '浏览本机索引与文档；上传与向量化优先在桌面完成。',
    emptyHint: '暂无本地知识库',
    defaultFolderId: DEFAULT_LOCAL_FOLDER_ID,
    importMode: 'file',
    showDropzone: true,
  },
  {
    id: 'network',
    label: '网络知识库',
    hint: '浏览网络来源的知识库；抓取与索引优先在桌面完成。',
    emptyHint: '暂无网络知识库',
    defaultFolderId: DEFAULT_NETWORK_FOLDER_ID,
    importMode: 'url',
    showDropzone: true,
  },
  {
    id: 'shared',
    label: '共享知识库',
    hint: '群组或他人共享的知识库副本。',
    emptyHint: '暂无共享知识库',
    defaultFolderId: null,
    importMode: 'file',
    showDropzone: true,
  },
]

export const DEFAULT_FOLDER_LABEL = '默认文件夹'

export const SYSTEM_DEFAULT_FOLDER_KB_NAMES = new Set([
  DEFAULT_FOLDER_LABEL,
  '默认网络文件夹',
  '默认本地文件',
])

export function isSystemDefaultFolderName(name: string): boolean {
  return SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(name)
}

/** Desktop's built-in 默认文件夹 is shown as the virtual row, not a second synced item. */
export function listedSyncKnowledgeItems<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => !isSystemDefaultFolderName(item.name))
}

export function mobileSyncKbUiId(kb: { id: string; name: string }): string {
  return isSystemDefaultFolderName(kb.name) ? DEFAULT_SYNC_FOLDER_ID : kb.id
}

export function getKnowledgeSection(
  id: KnowledgeSidebarSection,
): (typeof KNOWLEDGE_SIDEBAR_SECTIONS)[number] {
  return (
    KNOWLEDGE_SIDEBAR_SECTIONS.find((section) => section.id === id) ??
    KNOWLEDGE_SIDEBAR_SECTIONS[0]!
  )
}

export function defaultActiveKbId(section: KnowledgeSidebarSection): string | null {
  return getKnowledgeSection(section).defaultFolderId
}

export function knowledgeBasesForSection(
  sectionId: KnowledgeSidebarSection,
  createdKbs: Array<{ id: string; name: string; kind: string }>,
  syncedKbs: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  const created = createdKbs.filter((kb) => kb.kind === sectionId)
  if (sectionId === 'sync') {
    const createdIds = new Set(created.map((kb) => kb.id))
    return [...created, ...syncedKbs.filter((kb) => !createdIds.has(kb.id))]
  }
  return created
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDocTime(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  return name.slice(idx + 1).toLowerCase()
}
