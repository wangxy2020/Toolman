import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { KnowledgeMetaItem } from '@toolman/shared'
import { colors } from '../theme'
import {
  createDesktopClassroomKnowledgeBase,
  listDesktopClassroomKnowledgeBases,
} from '../host/invokeDesktop'

type Props = {
  visible: boolean
  selectedKbId: string | null
  /** Local cache / sync meta used when desktop host is offline. */
  fallbackItems: KnowledgeMetaItem[]
  onClose: () => void
  onSelect: (item: KnowledgeMetaItem) => void
}

function mergeKbItems(
  primary: KnowledgeMetaItem[],
  fallback: KnowledgeMetaItem[],
): KnowledgeMetaItem[] {
  const byId = new Map<string, KnowledgeMetaItem>()
  for (const item of [...fallback, ...primary]) {
    byId.set(item.id, item)
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export function ClassroomTextbookKbPicker(props: Props) {
  const { visible, selectedKbId, fallbackItems, onClose, onSelect } = props
  const [items, setItems] = useState<KnowledgeMetaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const listed = useMemo(() => mergeKbItems(items, fallbackItems), [fallbackItems, items])

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await listDesktopClassroomKnowledgeBases()
      setItems(next)
    } catch (err) {
      setItems([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    setCreateOpen(false)
    setCreateName('')
    setCreateError(null)
    void refresh()
  }, [visible])

  const handleCreate = async () => {
    const name = createName.trim()
    if (!name) {
      setCreateError('请填写教材名称')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createDesktopClassroomKnowledgeBase({ name })
      setItems((prev) => mergeKbItems([created], prev))
      setCreateOpen(false)
      setCreateName('')
      onSelect(created)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>选择教材知识库</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.toolbar}>
            <Pressable onPress={() => void refresh()} style={styles.toolBtn} disabled={loading}>
              <Text style={styles.toolBtnText}>{loading ? '刷新中…' : '刷新'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setCreateOpen(true)
                setCreateError(null)
                setCreateName('')
              }}
              style={[styles.toolBtn, styles.toolBtnPrimary]}
            >
              <Text style={styles.toolBtnPrimaryText}>添加教材</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}（仍可选择已同步知识库）</Text> : null}
          <Text style={styles.hint}>
            新建教材会在桌面端创建空知识库；请在桌面知识库中导入文件后再生成大纲。
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {loading && listed.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : listed.length === 0 ? (
              <Text style={styles.hint}>暂无可用知识库。可点「添加教材」或先在桌面端创建。</Text>
            ) : (
              listed.map((item) => {
                const active = item.id === selectedKbId
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onSelect(item)}
                    style={[styles.row, active ? styles.rowActive : null]}
                  >
                    <Text style={[styles.rowTitle, active ? styles.rowTitleActive : null]}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {item.kind} · {item.documentCount} 篇文档
                    </Text>
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </View>
      </View>

      {createOpen ? (
        <View style={styles.createOverlay} pointerEvents="box-none">
          <View style={styles.createDialog}>
            <Text style={styles.createTitle}>添加教材</Text>
            <Text style={styles.hint}>将在桌面端创建本地教材知识库，可稍后导入文件。</Text>
            <TextInput
              style={styles.input}
              value={createName}
              onChangeText={(value) => {
                setCreateName(value)
                setCreateError(null)
              }}
              placeholder="教材名称"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            {createError ? <Text style={styles.error}>{createError}</Text> : null}
            <View style={styles.createFooter}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={[styles.footerBtn, styles.footerBtnSecondary]}
                disabled={creating}
              >
                <Text style={styles.footerBtnSecondaryText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleCreate()}
                style={[styles.footerBtn, styles.footerBtnPrimary]}
                disabled={creating}
              >
                <Text style={styles.footerBtnPrimaryText}>{creating ? '创建中…' : '创建'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    maxHeight: '80%',
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  toolBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bg,
  },
  toolBtnPrimary: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  toolBtnText: { fontSize: 12, fontWeight: '500', color: colors.text },
  toolBtnPrimaryText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  hint: {
    marginTop: 8,
    paddingHorizontal: 16,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  error: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220,38,38,0.08)',
    fontSize: 12,
    color: colors.danger,
  },
  list: { marginTop: 8, maxHeight: 360 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowTitle: { fontSize: 13, fontWeight: '500', color: colors.text },
  rowTitleActive: { color: colors.accent },
  rowMeta: { fontSize: 12, color: colors.textSecondary },
  createOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  createDialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    padding: 16,
    gap: 8,
  },
  createTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  createFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: { backgroundColor: colors.hover },
  footerBtnPrimary: { backgroundColor: colors.accent },
  footerBtnSecondaryText: { fontSize: 13, fontWeight: '500', color: colors.text },
  footerBtnPrimaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
})
