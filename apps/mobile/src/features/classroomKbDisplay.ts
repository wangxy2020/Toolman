import { DEFAULT_FOLDER_LABEL, isSystemDefaultFolderName } from './knowledgeSidebar'

const KNOWLEDGE_KIND_LABELS: Record<string, string> = {
  local: '本地知识库',
  network: '网络知识库',
  local_files: '本地文件',
  shared: '共享知识库',
  sync: '同步知识库',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HEX_ID_RE = /^[0-9a-f-]{16,}$/i

export type ClassroomKbDisplayItem = {
  id: string
  name: string
  kind: string
  documentCount?: number
  documentTitles?: string[]
}

export function classroomKbKindLabel(kind: string): string {
  return KNOWLEDGE_KIND_LABELS[kind] ?? kind
}

export function looksLikeOpaqueKbId(value: string): boolean {
  const trimmed = value.trim()
  return UUID_RE.test(trimmed) || HEX_ID_RE.test(trimmed)
}

export function classroomKbDisplayName(item: Pick<ClassroomKbDisplayItem, 'name' | 'kind'>): string {
  const name = item.name.trim()
  if (!name || looksLikeOpaqueKbId(name)) {
    return classroomKbKindLabel(item.kind)
  }
  if (isSystemDefaultFolderName(name)) {
    return `${classroomKbKindLabel(item.kind)} · ${DEFAULT_FOLDER_LABEL}`
  }
  return name
}

export function readableClassroomDocumentTitles(titles: string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of titles ?? []) {
    const title = raw.trim()
    if (!title || looksLikeOpaqueKbId(title) || seen.has(title)) continue
    seen.add(title)
    out.push(title)
  }
  return out
}

export function classroomKbDocumentSummary(item: ClassroomKbDisplayItem): string {
  const titles = readableClassroomDocumentTitles(item.documentTitles)
  if (titles.length > 0) return titles.join('、')
  const count = item.documentCount ?? 0
  if (count > 0) return `${count} 篇文档`
  return '暂无文档'
}

export function formatClassroomKbSelectionLabel(item: ClassroomKbDisplayItem): string {
  const name = classroomKbDisplayName(item)
  const titles = readableClassroomDocumentTitles(item.documentTitles)
  if (titles.length > 0) return `${name}（${titles.join('、')}）`
  const count = item.documentCount ?? 0
  if (count > 0) return `${name}（${count} 篇文档）`
  return name
}

export function resolveBoundClassroomKbLabel(input: {
  id: string
  item?: ClassroomKbDisplayItem | null
  remembered?: string
}): string {
  const remembered = input.remembered?.trim()
  if (input.item) {
    const titles = readableClassroomDocumentTitles(input.item.documentTitles)
    if (titles.length > 0) return formatClassroomKbSelectionLabel(input.item)
    if (remembered) return remembered
    return formatClassroomKbSelectionLabel(input.item)
  }
  if (remembered) return remembered
  return looksLikeOpaqueKbId(input.id) ? '已绑定教材' : input.id
}

export function classroomKbTitlesFromSnapshot(
  kbId: string,
  snapshot: {
    documents: Array<{ id: string; kbId: string; title: string }>
    files: Array<{ documentId: string; kbId: string; fileName: string }>
  } | null | undefined,
): string[] {
  if (!snapshot) return []
  const fileNameByDoc = new Map(
    snapshot.files
      .filter((file) => file.kbId === kbId)
      .map((file) => [file.documentId, file.fileName]),
  )
  return readableClassroomDocumentTitles(
    snapshot.documents
      .filter((doc) => doc.kbId === kbId)
      .map((doc) => fileNameByDoc.get(doc.id) || doc.title),
  )
}

export function enrichClassroomKbItemWithTitles<T extends ClassroomKbDisplayItem>(
  item: T,
  titles: string[] | undefined,
): T {
  const merged = readableClassroomDocumentTitles([
    ...(item.documentTitles ?? []),
    ...(titles ?? []),
  ])
  if (merged.length === 0) return item
  if (
    item.documentTitles &&
    item.documentTitles.length === merged.length &&
    item.documentTitles.every((title, index) => title === merged[index])
  ) {
    return item
  }
  return { ...item, documentTitles: merged }
}
