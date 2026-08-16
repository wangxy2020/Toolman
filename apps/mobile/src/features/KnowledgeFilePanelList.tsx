import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native'
import { colors } from '../theme'
import { fileExtension, formatDocTime, type KnowledgeFileItem } from './knowledgeSidebar'
import { IconCheck, IconFile, IconGlobe, IconRefresh, IconTrash } from './KnowledgeFilePanelIcons'
import { styles } from './KnowledgeFilePanelStyles'
import { knowledgeFileIconTone } from './useKnowledgeFilePanel'

export type KnowledgeFilePanelListProps = {
  documents: KnowledgeFileItem[]
  isUrlMode: boolean
  selectedIds: Set<string>
  onOpenMenu: (event: GestureResponderEvent) => void
  onReindexDocument: (id: string) => void
  onConfirmDelete: (ids: string[]) => void
  onToggleSelected: (id: string) => void
}

export function KnowledgeFilePanelList({
  documents,
  isUrlMode,
  selectedIds,
  onOpenMenu,
  onReindexDocument,
  onConfirmDelete,
  onToggleSelected,
}: KnowledgeFilePanelListProps) {
  if (documents.length === 0) {
    return (
      <Pressable onLongPress={(event) => onOpenMenu(event)} delayLongPress={400}>
        <Text style={styles.empty}>{isUrlMode ? '暂无网页' : '暂无文件'}</Text>
      </Pressable>
    )
  }

  return (
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
            onLongPress={(event) => onOpenMenu(event)}
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
                onPress={() => onConfirmDelete([doc.id])}
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
                onPress={() => onToggleSelected(doc.id)}
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
  )
}
