import { useCallback, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native'
import Svg, { Line, Path, Rect } from 'react-native-svg'
import { colors } from '../theme'
import {
  fileExtension,
  formatDocTime,
  formatFileSize,
  type KnowledgeFileItem,
  type KnowledgeImportMode,
} from './knowledgeSidebar'

type IconProps = { size?: number; color?: string }

function IconFile({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
      <Path d="M14 2v6h6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

function IconGlobe({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="18" height="18" rx="9" stroke={color} strokeWidth={1.8} fill="none" />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
      />
    </Svg>
  )
}

function IconTrash({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

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

function iconTone(ext: string): { color: string; backgroundColor: string } {
  if (ext === 'pdf') return { color: '#dc2626', backgroundColor: '#fef2f2' }
  if (['md', 'txt', 'html', 'htm', 'csv'].includes(ext)) {
    return { color: '#2563eb', backgroundColor: '#eff6ff' }
  }
  if (['doc', 'docx'].includes(ext)) return { color: '#1d4ed8', backgroundColor: '#dbeafe' }
  if (['xls', 'xlsx'].includes(ext)) return { color: '#15803d', backgroundColor: '#dcfce7' }
  if (['ppt', 'pptx'].includes(ext)) return { color: '#c2410c', backgroundColor: '#ffedd5' }
  return { color: colors.textSecondary, backgroundColor: colors.hover }
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
}

export function KnowledgeFilePanel(props: {
  documents: KnowledgeFileItem[]
  mode: KnowledgeImportMode
  showDropzone: boolean
  importDisabled?: boolean
  onImportFiles: (items: KnowledgeFileItem[]) => void
  onDeleteDocument: (id: string) => void
  onImportError?: (message: string) => void
}) {
  const {
    documents,
    mode,
    showDropzone,
    importDisabled = false,
    onImportFiles,
    onDeleteDocument,
    onImportError,
  } = props
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const isUrlMode = mode === 'url'
  const dropzoneDisabled = importDisabled || (!isUrlMode && Platform.OS !== 'web')

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
      onImportFiles([
        {
          id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          title: trimmed,
          sizeLabel: 'URL',
          addedAt: Date.now(),
          status: 'ready',
          sourceKind: 'url',
          absolutePath: trimmed,
        },
      ])
      return
    }
    try {
      const files = await pickLocalFiles()
      importFromFiles(files)
    } catch (error) {
      onImportError?.(error instanceof Error ? error.message : '选择文件失败')
    }
  }

  const webDragProps: WebDragHandlers | undefined =
    Platform.OS === 'web' && showDropzone
      ? {
          onDragEnter: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (dropzoneDisabled) return
            dragDepth.current += 1
            setDragOver(true)
          },
          onDragOver: (event) => {
            event.preventDefault()
            event.stopPropagation()
          },
          onDragLeave: (event) => {
            event.preventDefault()
            event.stopPropagation()
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setDragOver(false)
          },
          onDrop: (event) => {
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
                onImportFiles([
                  {
                    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    title: trimmed,
                    sizeLabel: 'URL',
                    addedAt: Date.now(),
                    status: 'ready',
                    sourceKind: 'url',
                    absolutePath: trimmed,
                  },
                ])
                return
              }
              onImportError?.('请拖入有效的网页链接')
              return
            }
            const files = Array.from(event.dataTransfer?.files ?? [])
            importFromFiles(files)
          },
        }
      : undefined

  return (
    <View style={styles.panel} {...(webDragProps as ViewProps)}>
      {showDropzone ? (
        <Pressable
          disabled={dropzoneDisabled}
          onPress={() => void handlePick()}
          style={({ pressed }) => [
            styles.dropzone,
            dragOver ? styles.dropzoneActive : null,
            pressed && !dropzoneDisabled ? styles.dropzonePressed : null,
            dropzoneDisabled ? styles.dropzoneDisabled : null,
          ]}
        >
          <Text style={styles.dropTitle}>
            {isUrlMode ? '拖拽网页到这里或点击添加' : '拖拽文件到这里或点击添加'}
          </Text>
          <Text style={styles.dropHint}>
            {isUrlMode
              ? '支持 HTTP/HTTPS 网页链接，也可从浏览器拖拽书签或链接'
              : '支持 TXT, MD, HTML, PDF, DOCX, PPTX, XLSX, EPUB... 格式'}
          </Text>
        </Pressable>
      ) : null}

      {documents.length === 0 ? (
        <Text style={styles.empty}>
          {isUrlMode ? '暂无网页' : '暂无文件'}
        </Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {documents.map((doc) => {
            const isUrl = doc.sourceKind === 'url' || isUrlMode
            const ext = fileExtension(doc.title)
            const tone = isUrl
              ? { color: '#2563eb', backgroundColor: '#dbeafe' }
              : iconTone(ext)
            return (
              <View key={doc.id} style={styles.card}>
                <View style={[styles.cardIcon, { backgroundColor: tone.backgroundColor }]}>
                  {isUrl ? (
                    <IconGlobe size={18} color={tone.color} />
                  ) : (
                    <IconFile size={18} color={tone.color} />
                  )}
                </View>
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {doc.sizeLabel} · {formatDocTime(doc.addedAt)}
                  </Text>
                  <Text
                    style={[
                      styles.cardStatus,
                      doc.status === 'ready' ? styles.cardStatusReady : null,
                    ]}
                  >
                    {doc.status === 'ready' ? '已就绪' : '处理中'}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="删除"
                  onPress={() => onDeleteDocument(doc.id)}
                  style={({ pressed }) => [
                    styles.cardAction,
                    pressed ? styles.cardActionPressed : null,
                  ]}
                >
                  <IconTrash size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.hover,
  },
  dropzonePressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropzoneActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropzoneDisabled: {
    opacity: 0.6,
  },
  dropTitle: {
    fontSize: 13,
    color: colors.text,
  },
  dropHint: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  empty: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardStatus: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardStatusReady: {
    color: '#2e9b6a',
  },
  cardAction: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionPressed: {
    backgroundColor: colors.hover,
  },
})
