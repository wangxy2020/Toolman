import { Pressable, ScrollView, StyleSheet, Text, View, type ViewProps } from 'react-native'
import Svg, { Line, Path, Polyline, Rect } from 'react-native-svg'
import { colors } from '../theme'
import { KnowledgeFileContextMenu } from './KnowledgeFileContextMenu'
import { fileExtension, formatDocTime } from './knowledgeSidebar'
import {
  knowledgeFileIconTone,
  useKnowledgeFilePanel,
  type KnowledgeFilePanelProps,
} from './useKnowledgeFilePanel'

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

function IconRefresh({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12a9 9 0 1 1-2.64-6.36" stroke={color} strokeWidth={1.8} fill="none" />
      <Path d="M21 3v6h-6" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  )
}

function IconCheck({ size = 14, color = '#16a34a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline
        points="20 6 9 17 4 12"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function KnowledgeFilePanel(props: KnowledgeFilePanelProps) {
  const {
    documents,
    showDropzone,
    syncMoveTargets = [],
    onReindexDocument,
    onReindexAll,
  } = props
  const {
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
  } = useKnowledgeFilePanel(props)

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
        <Pressable onLongPress={(event) => openMenu(event)} delayLongPress={400}>
          <Text style={styles.empty}>{isUrlMode ? '暂无网页' : '暂无文件'}</Text>
        </Pressable>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {documents.map((doc) => {
            const isUrl = doc.sourceKind === 'url' || isUrlMode
            const ext = fileExtension(doc.title)
            const tone = isUrl
              ? { color: '#2563eb', backgroundColor: '#dbeafe' }
              : knowledgeFileIconTone(ext)
            const selected = selectedIds.has(doc.id)
            const processing = doc.status === 'pending'
            return (
              <Pressable
                key={doc.id}
                delayLongPress={400}
                onLongPress={(event) => openMenu(event)}
                style={[styles.card, selected ? styles.cardSelected : null]}
              >
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
                    {doc.status === 'ready' ? '已嵌入' : '处理中'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <Pressable
                    accessibilityLabel={isUrl ? '刷新网页' : '重新向量化'}
                    disabled={processing}
                    onPress={() => onReindexDocument(doc.id)}
                    style={({ pressed }) => [
                      styles.cardAction,
                      pressed ? styles.cardActionPressed : null,
                    ]}
                  >
                    <IconRefresh size={16} color={colors.textSecondary} />
                  </Pressable>
                  <View
                    style={[
                      styles.statusBadge,
                      doc.status === 'ready' ? styles.statusReady : styles.statusPending,
                    ]}
                    accessibilityLabel={doc.status === 'ready' ? '已嵌入' : '处理中'}
                  >
                    {doc.status === 'ready' ? (
                      <IconCheck size={14} color="#16a34a" />
                    ) : (
                      <IconRefresh size={14} color={colors.textSecondary} />
                    )}
                  </View>
                  <Pressable
                    accessibilityLabel="删除文件"
                    disabled={processing}
                    onPress={() => confirmDelete([doc.id])}
                    style={({ pressed }) => [
                      styles.cardAction,
                      pressed ? styles.cardActionDangerPressed : null,
                    ]}
                  >
                    <IconTrash size={16} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="选择文件"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    disabled={processing}
                    onPress={() => toggleSelected(doc.id)}
                    style={styles.selectHit}
                  >
                    <View style={[styles.selectBox, selected ? styles.selectBoxChecked : null]}>
                      {selected ? <IconCheck size={11} color="#ffffff" /> : null}
                    </View>
                  </Pressable>
                </View>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <KnowledgeFileContextMenu
        visible={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        selectedCount={selectedIds.size}
        documentCount={documents.length}
        syncMoveTargets={syncMoveTargets}
        onClose={closeMenu}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onDeleteSelected={() => confirmDelete(Array.from(selectedIds))}
        onReindexAll={onReindexAll}
        onMoveToSync={handleMoveToSync}
      />
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
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  cardSelected: {
    borderColor: '#7dceb0',
    backgroundColor: '#f3fbf7',
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionPressed: {
    backgroundColor: colors.hover,
  },
  cardActionDangerPressed: {
    backgroundColor: '#fef2f2',
  },
  statusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusReady: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: colors.hover,
  },
  selectHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
})
