import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native'
import { colors } from '../theme'
import type { MobileSyncMoveTarget } from './KnowledgeFileContextMenu'
import {
  formatFileSize,
  type KnowledgeFileItem,
  type KnowledgeImportMode,
} from './knowledgeSidebar'

const ACCEPT =
  '.txt,.md,.markdown,.html,.htm,.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.epub,.csv'

function pickLocalFiles(): Promise<File[]> {
  if (typeof document === 'undefined') return Promise.resolve([])
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = ACCEPT
    input.style.display = 'none'
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      input.remove()
      resolve(files)
    }
    input.oncancel = () => {
      input.remove()
      resolve([])
    }
    document.body.appendChild(input)
    input.click()
  })
}

function filesToItems(files: File[]): KnowledgeFileItem[] {
  return files.map((file) => ({
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: file.name,
    sizeLabel: formatFileSize(file.size),
    addedAt: Date.now(),
    status: 'ready',
    sourceKind: 'file',
    absolutePath: file.name,
  }))
}

function urlToItem(trimmed: string): KnowledgeFileItem {
  return {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: trimmed,
    sizeLabel: 'URL',
    addedAt: Date.now(),
    status: 'ready',
    sourceKind: 'url',
    absolutePath: trimmed,
  }
}

export function knowledgeFileIconTone(ext: string): { color: string; backgroundColor: string } {
  if (ext === 'pdf') return { color: '#dc2626', backgroundColor: '#fef2f2' }
  if (['md', 'txt', 'html', 'htm', 'csv'].includes(ext)) {
    return { color: '#2563eb', backgroundColor: '#eff6ff' }
  }
  if (['doc', 'docx'].includes(ext)) return { color: '#1d4ed8', backgroundColor: '#dbeafe' }
  if (['xls', 'xlsx'].includes(ext)) return { color: '#15803d', backgroundColor: '#dcfce7' }
  if (['ppt', 'pptx'].includes(ext)) return { color: '#c2410c', backgroundColor: '#ffedd5' }
  return { color: colors.textSecondary, backgroundColor: colors.hover }
}

function eventPoint(event: GestureResponderEvent | { nativeEvent?: { pageX?: number; pageY?: number }; pageX?: number; pageY?: number }): {
  x: number
  y: number
} {
  const native = 'nativeEvent' in event ? event.nativeEvent : undefined
  return {
    x: native?.pageX ?? ('pageX' in event ? Number(event.pageX) : 24) ?? 24,
    y: native?.pageY ?? ('pageY' in event ? Number(event.pageY) : 96) ?? 96,
  }
}

type WebDragHandlers = Pick<ViewProps, never> & {
  onDragEnter?: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  onDragOver?: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  onDragLeave?: (event: { preventDefault: () => void; stopPropagation: () => void }) => void
  onDrop?: (event: {
    preventDefault: () => void
    stopPropagation: () => void
    dataTransfer?: { files?: FileList; getData?: (type: string) => string }
  }) => void
  onContextMenu?: (event: { preventDefault: () => void } & Record<string, unknown>) => void
}

export type KnowledgeFilePanelProps = {
  documents: KnowledgeFileItem[]
  mode: KnowledgeImportMode
  showDropzone: boolean
  importDisabled?: boolean
  listKey?: string | null
  syncMoveTargets?: Array<{ id: string; name: string }>
  onImportFiles: (items: KnowledgeFileItem[]) => void
  onDeleteDocument: (id: string) => void
  onReindexDocument: (id: string) => void
  onReindexAll: () => void
  onMoveToSync: (ids: string[], target: MobileSyncMoveTarget) => void
  onImportError?: (message: string) => void
}

export function useKnowledgeFilePanel(props: KnowledgeFilePanelProps) {
  const {
    documents,
    mode,
    showDropzone,
    importDisabled = false,
    listKey,
    onImportFiles,
    onDeleteDocument,
    onMoveToSync,
    onImportError,
  } = props
  const [dragOver, setDragOver] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const dragDepth = useRef(0)
  const isUrlMode = mode === 'url'
  const dropzoneDisabled = importDisabled || (!isUrlMode && Platform.OS !== 'web')

  useEffect(() => {
    setSelectedIds(new Set())
    setMenu(null)
  }, [listKey])

  const importFromFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      onImportFiles(filesToItems(files))
    },
    [onImportFiles],
  )

  const handlePick = async () => {
    if (dropzoneDisabled) return
    if (isUrlMode) {
      if (typeof window === 'undefined') return
      const url = window.prompt('输入网页链接（http/https）')
      const trimmed = url?.trim() ?? ''
      if (!trimmed) return
      if (!/^https?:\/\//i.test(trimmed)) {
        onImportError?.('请输入以 http:// 或 https:// 开头的链接')
        return
      }
      onImportFiles([urlToItem(trimmed)])
      return
    }
    try {
      const files = await pickLocalFiles()
      importFromFiles(files)
    } catch (error) {
      onImportError?.(error instanceof Error ? error.message : '选择文件失败')
    }
  }

  const openMenu = (event: GestureResponderEvent | { preventDefault?: () => void; nativeEvent?: { pageX?: number; pageY?: number }; pageX?: number; pageY?: number }) => {
    event.preventDefault?.()
    if (documents.length === 0) return
    setMenu(eventPoint(event))
  }

  const confirmDelete = (ids: string[]) => {
    if (ids.length === 0) return
    Alert.alert('删除文件', `确定删除 ${ids.length} 个文件？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          for (const id of ids) onDeleteDocument(id)
          setSelectedIds(new Set())
        },
      },
    ])
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(documents.map((item) => item.id)))
  const clearSelection = () => setSelectedIds(new Set())
  const closeMenu = () => setMenu(null)

  const handleMoveToSync = (target: MobileSyncMoveTarget) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    onMoveToSync(ids, target)
    setSelectedIds(new Set())
  }

  const webDragProps: WebDragHandlers | undefined =
    Platform.OS === 'web'
      ? {
          onContextMenu: (event) => openMenu(event),
          ...(showDropzone
            ? {
                onDragEnter: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (dropzoneDisabled) return
                  dragDepth.current += 1
                  setDragOver(true)
                },
                onDragOver: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
                  event.preventDefault()
                  event.stopPropagation()
                },
                onDragLeave: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
                  event.preventDefault()
                  event.stopPropagation()
                  dragDepth.current = Math.max(0, dragDepth.current - 1)
                  if (dragDepth.current === 0) setDragOver(false)
                },
                onDrop: (event: {
                  preventDefault: () => void
                  stopPropagation: () => void
                  dataTransfer?: { files?: FileList; getData?: (type: string) => string }
                }) => {
                  event.preventDefault()
                  event.stopPropagation()
                  dragDepth.current = 0
                  setDragOver(false)
                  if (dropzoneDisabled) return
                  if (isUrlMode) {
                    const uri =
                      event.dataTransfer?.getData?.('text/uri-list') ||
                      event.dataTransfer?.getData?.('text/plain') ||
                      ''
                    const trimmed = uri.split('\n')[0]?.trim() ?? ''
                    if (trimmed && /^https?:\/\//i.test(trimmed)) {
                      onImportFiles([urlToItem(trimmed)])
                      return
                    }
                    onImportError?.('请拖入有效的网页链接')
                    return
                  }
                  const files = Array.from(event.dataTransfer?.files ?? [])
                  importFromFiles(files)
                },
              }
            : {}),
        }
      : undefined

  return {
    dragOver,
    selectedIds,
    menu,
    isUrlMode,
    dropzoneDisabled,
    handlePick,
    openMenu,
    confirmDelete,
    toggleSelected,
    selectAll,
    clearSelection,
    closeMenu,
    handleMoveToSync,
    webDragProps,
  }
}
