import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GroupSharedItem, GroupSharedKind } from '../storage/groupChat'
import {
  GroupResourcePickerModal,
  type GroupPickerGroup,
  type GroupPickerSelection,
} from './GroupResourcePickerModal'
import { GroupPanelHeader, type SharedItemDetail } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import { groupSharedPaneStyles as sharedStyles } from './groupSharedPaneStyles'
import { MessageMarkdown } from './MessageMarkdown'
import { useGroupSharedResourcePane } from './useGroupPagePanels'

export function GroupSharedResourcePane(props: {
  kind: GroupSharedKind
  title: string
  typeNoun: string
  groupName: string
  items: GroupSharedItem[]
  pickerGroups: GroupPickerGroup[]
  canAdd?: boolean
  getDetail: (item: GroupSharedItem) => SharedItemDetail
  onAdd: (selection: GroupPickerSelection[]) => void
  onSaveNote?: (item: GroupSharedItem, content: string) => void
}) {
  const { pickerOpen, setPickerOpen, openItemId, setOpenItemId, hint, handleConfirm } =
    useGroupSharedResourcePane({
      kind: props.kind,
      onAdd: props.onAdd,
    })
  const count = props.items.length
  const openItem = props.items.find((item) => item.id === openItemId) ?? null
  const canAdd = props.canAdd !== false

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title={props.title}
        subtitle={`${props.groupName} · ${count} 个${props.typeNoun}`}
      />
      {canAdd ? (
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.dropzone, pressed ? styles.dropzonePressed : null]}
        >
          <Text style={styles.dropTitle}>点击添加{props.typeNoun}到群组</Text>
          <Text style={styles.dropHint}>从已有{props.typeNoun}中选择，共享给群组成员</Text>
        </Pressable>
      ) : (
        <Text style={styles.dropHint}>只读成员可查看群组已共享的{props.typeNoun}</Text>
      )}
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {count === 0 ? (
          <Text style={styles.emptyText}>
            {canAdd ? `暂无群组${props.typeNoun}，点击上方区域添加` : `暂无群组${props.typeNoun}`}
          </Text>
        ) : (
          props.items.map((item) => (
            <Pressable
              key={`${item.kind}-${item.id}`}
              onPress={() => setOpenItemId(item.id)}
              style={({ pressed }) => [styles.sharedCard, pressed ? styles.sharedCardPressed : null]}
            >
              <Text style={styles.sharedName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.parentName || item.preview ? (
                <Text style={styles.sharedMeta} numberOfLines={1}>
                  {item.parentName || item.preview}
                </Text>
              ) : null}
            </Pressable>
          ))
        )}
      </ScrollView>
      <GroupResourcePickerModal
        visible={pickerOpen}
        title={`选择${props.typeNoun}`}
        hint={hint}
        emptyLabel="暂无可添加的内容"
        groups={props.pickerGroups}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleConfirm}
      />
      <SharedItemReaderModal
        item={openItem}
        detail={openItem ? props.getDetail(openItem) : null}
        onClose={() => setOpenItemId(null)}
        onSaveNote={props.onSaveNote}
      />
    </View>
  )
}

function SharedItemReaderModal(props: {
  item: GroupSharedItem | null
  detail: SharedItemDetail | null
  onClose: () => void
  onSaveNote?: (item: GroupSharedItem, content: string) => void
}) {
  const { item, detail, onClose } = props
  const [draft, setDraft] = useState('')
  const visible = Boolean(item && detail)
  const editing = Boolean(item && detail?.canEdit && item.kind === 'notes')

  useEffect(() => {
    setDraft(detail?.body ?? '')
  }, [item?.id, detail?.body])

  if (!visible || !item || !detail) return null

  const body = editing ? draft : detail.body || item.preview || ''
  const isImage = Boolean(detail.mimeType?.startsWith('image/') && detail.blobUrl)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={sharedStyles.readerOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View style={sharedStyles.readerDialog} onStartShouldSetResponder={() => true}>
          <View style={sharedStyles.readerHeader}>
            <Text style={sharedStyles.readerTitle} numberOfLines={1}>
              {detail.title}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8}>
              <Text style={sharedStyles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView style={sharedStyles.readerBody} contentContainerStyle={sharedStyles.readerBodyContent}>
            {isImage ? (
              <Text style={styles.sharedMeta}>图片已下载，可在浏览器打开附件。</Text>
            ) : null}
            {detail.blobUrl && !editing ? (
              <Text
                style={sharedStyles.readerLink}
                onPress={() => {
                  if (typeof globalThis.open === 'function') globalThis.open(detail.blobUrl, '_blank')
                }}
              >
                打开文件
              </Text>
            ) : null}
            {editing ? (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                style={sharedStyles.readerInput}
                textAlignVertical="top"
              />
            ) : body ? (
              <MessageMarkdown text={body} variant="note" />
            ) : (
              <Text style={styles.emptyHint}>
                {item.kind === 'notes'
                  ? '这篇共享笔记还没有正文。直连群主后会从事件日志补齐。'
                  : '群组共享镜像，仅显示已授权的元数据。'}
              </Text>
            )}
          </ScrollView>
          {editing && props.onSaveNote ? (
            <Pressable
              onPress={() => {
                props.onSaveNote?.(item, draft)
                onClose()
              }}
              style={({ pressed }) => [sharedStyles.readerSave, pressed ? styles.dropzonePressed : null]}
            >
              <Text style={styles.dropTitle}>保存到群组</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
