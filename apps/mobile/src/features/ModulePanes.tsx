import { useMemo, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import type { MobileModuleId } from '../modules'
import { IconPlus } from '../icons/composer-icons'
import { useSidebarLayout } from '../layout'
import { useMobileApp } from '../state/MobileAppContext'
import {
  buildNotebookName,
  buildNoteTitle,
  createNoteId,
  createNotebookId,
  DEFAULT_NOTEBOOK_ID,
  rememberDeletedNotes,
  type MobileNote,
} from '../storage/notes'
import { colors, shellStyles } from '../theme'
import { useRegisterModulePanelStatus } from './modulePageStatus'
import { NotesRichBodyEditor } from './NotesRichBodyEditor'
import { extractNoteOutline, prepareNoteMarkdown } from './noteBodyDisplay'
import { MessageMarkdown } from './MessageMarkdown'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SwipeableTopicRow } from './SwipeableTopicRow'

const MODULE_COPY: Record<
  Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community' | 'projects'>,
  {
    listTitle: string
    hint: string
    addLabel: string
    emptyHint: string
  }
> = {
  notes: {
    listTitle: '笔记',
    hint: '笔记与桌面同账户同步（Sync API）。',
    addLabel: '新建笔记本',
    emptyHint: '暂无笔记本',
  },
  translate: {
    listTitle: '翻译任务',
    hint: '重 PDF 管线可在桌面完成；移动端负责任务列表与阅读。',
    addLabel: '新建对照',
    emptyHint: '暂无对照',
  },
  classroom: {
    listTitle: '课堂',
    hint: '教材摄取在桌面；可经桌面宿主调用课堂智能体。',
    addLabel: '开课',
    emptyHint: '暂无课堂',
  },
}

function NotesChevron({ open }: { open: boolean }) {
  return (
    <Text style={[notesStyles.chevron, open ? notesStyles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

function NotesLeftPane() {
  const {
    notebooks,
    setNotebooks,
    notes,
    setNotes,
    deletedNotes,
    setDeletedNotes,
    activeNoteId,
    setActiveNoteId,
    setLeftOpen,
  } = useMobileApp()
  const layout = useSidebarLayout()

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const active = notes.find((item) => item.id === activeNoteId)
    const seed = active?.notebookId ?? notebooks[0]?.id ?? DEFAULT_NOTEBOOK_ID
    return new Set([seed])
  })
  const [renameTarget, setRenameTarget] = useState<{ kind: 'notebook' | 'note'; id: string } | null>(
    null,
  )
  const [draftTitle, setDraftTitle] = useState('')
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)

  const notesByNotebook = useMemo(() => {
    const map = new Map<string, MobileNote[]>()
    for (const note of notes) {
      const list = map.get(note.notebookId) ?? []
      list.push(note)
      map.set(note.notebookId, list)
    }
    return map
  }, [notes])

  const activeNotebookId = useMemo(() => {
    const active = notes.find((item) => item.id === activeNoteId)
    return active?.notebookId ?? null
  }, [notes, activeNoteId])

  const toggleExpanded = (notebookId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(notebookId)) next.delete(notebookId)
      else next.add(notebookId)
      return next
    })
  }

  const createNotebook = () => {
    const id = createNotebookId()
    const name = buildNotebookName(notebooks)
    setNotebooks([...notebooks, { id, name }])
    setExpanded((prev) => new Set(prev).add(id))
    setOpenSwipeId(null)
    setRenameTarget(null)
  }

  const createNote = (notebookId: string) => {
    const id = createNoteId()
    const title = buildNoteTitle(notes, notebookId)
    setNotes([
      { id, notebookId, title, body: '', updatedAt: Date.now() },
      ...notes,
    ])
    setExpanded((prev) => new Set(prev).add(notebookId))
    setActiveNoteId(id)
    setOpenSwipeId(null)
    setRenameTarget(null)
    setLeftOpen(false)
  }

  const isProtectedNotebook = (notebookId: string) =>
    notebooks.some((item) => item.id === notebookId && (item.isDefault || item.id === DEFAULT_NOTEBOOK_ID))

  const commitRename = () => {
    if (!renameTarget) return
    const next = draftTitle.trim()
    if (renameTarget.kind === 'notebook') {
      if (next) {
        setNotebooks(
          notebooks.map((item) => (item.id === renameTarget.id ? { ...item, name: next } : item)),
        )
      }
    } else if (next) {
      setNotes(
        notes.map((item) =>
          item.id === renameTarget.id ? { ...item, title: next, updatedAt: Date.now() } : item,
        ),
      )
    }
    setRenameTarget(null)
    setDraftTitle('')
  }

  const deleteNote = (note: MobileNote) => {
    const remaining = notes.filter((item) => item.id !== note.id)
    setNotes(remaining)
    setDeletedNotes(rememberDeletedNotes(deletedNotes, [note.id]))
    if (activeNoteId === note.id) {
      const sameNotebook = remaining.find((item) => item.notebookId === note.notebookId)
      setActiveNoteId(sameNotebook?.id ?? remaining[0]?.id ?? null)
    }
    if (renameTarget?.kind === 'note' && renameTarget.id === note.id) {
      setRenameTarget(null)
      setDraftTitle('')
    }
    setOpenSwipeId(null)
  }

  const confirmDeleteNote = (note: MobileNote) => {
    const title = note.title || '未命名笔记'
    const message = `确定删除「${title}」？此操作不可恢复。`
    const doDelete = () => deleteNote(note)

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除笔记', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  const deleteNotebook = (notebookId: string) => {
    if (isProtectedNotebook(notebookId)) return
    const remainingNotebooks = notebooks.filter((item) => item.id !== notebookId)
    const remainingNotes = notes.filter((item) => item.notebookId !== notebookId)
    const removedIds = notes
      .filter((item) => item.notebookId === notebookId)
      .map((item) => item.id)
    setNotebooks(remainingNotebooks)
    setNotes(remainingNotes)
    setDeletedNotes(rememberDeletedNotes(deletedNotes, removedIds))
    if (activeNotebookId === notebookId) {
      setActiveNoteId(remainingNotes[0]?.id ?? null)
    }
    if (renameTarget?.kind === 'notebook' && renameTarget.id === notebookId) {
      setRenameTarget(null)
      setDraftTitle('')
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(notebookId)
      return next
    })
    setOpenSwipeId(null)
  }

  const confirmDeleteNotebook = (notebookId: string, name: string) => {
    if (isProtectedNotebook(notebookId)) return
    const count = (notesByNotebook.get(notebookId) ?? []).length
    const message =
      count > 0
        ? `确定删除「${name}」及其 ${count} 篇笔记？此操作不可恢复。`
        : `确定删除「${name}」？此操作不可恢复。`
    const doDelete = () => deleteNotebook(notebookId)

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除笔记本', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  const notebookSwipeId = (id: string) => `notebook:${id}`
  const noteSwipeId = (id: string) => `note:${id}`

  return (
    <SidebarShell>
      <SidebarAddButton label="新建笔记本" onPress={createNotebook} />
      <SidebarList>
        {notebooks.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无笔记本</Text>
        ) : (
          notebooks.map((notebook) => {
            const isOpen = expanded.has(notebook.id)
            const notebookNotes = notesByNotebook.get(notebook.id) ?? []
            const isActive = notebook.id === activeNotebookId
            const renamingNotebook =
              renameTarget?.kind === 'notebook' && renameTarget.id === notebook.id
            const canDeleteNotebook = !isProtectedNotebook(notebook.id)
            return (
              <View key={notebook.id} style={notesStyles.group}>
                {renamingNotebook ? (
                  <View
                    style={[
                      notesStyles.notebookRenameWrap,
                      { minHeight: layout.rowMinHeight },
                      isActive ? notesStyles.renameWrapActive : null,
                    ]}
                  >
                    <TextInput
                      style={[notesStyles.renameInput, { fontSize: layout.topicFontSize }]}
                      value={draftTitle}
                      onChangeText={setDraftTitle}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={commitRename}
                      onBlur={commitRename}
                      placeholder="笔记本名称"
                      placeholderTextColor={colors.textSecondary}
                      underlineColorAndroid="transparent"
                    />
                  </View>
                ) : (
                  <SwipeableTopicRow
                    active={isActive}
                    variant="section"
                    open={openSwipeId === notebookSwipeId(notebook.id)}
                    onOpenChange={(open) =>
                      setOpenSwipeId(open ? notebookSwipeId(notebook.id) : null)
                    }
                    renameA11yLabel="重命名笔记本"
                    deleteA11yLabel="删除笔记本"
                    onPress={() => {
                      setOpenSwipeId(null)
                      toggleExpanded(notebook.id)
                    }}
                    onRename={() => {
                      setOpenSwipeId(null)
                      setRenameTarget({ kind: 'notebook', id: notebook.id })
                      setDraftTitle(notebook.name)
                    }}
                    onDelete={
                      canDeleteNotebook
                        ? () => confirmDeleteNotebook(notebook.id, notebook.name)
                        : undefined
                    }
                    trailing={
                      <Pressable
                        accessibilityLabel="新建笔记"
                        hitSlop={6}
                        onPress={() => createNote(notebook.id)}
                        style={({ pressed }) => [
                          notesStyles.actionBtn,
                          pressed ? notesStyles.actionBtnPressed : null,
                        ]}
                      >
                        {({ pressed }) => (
                          <IconPlus
                            size={14}
                            color={pressed ? colors.accent : colors.textSecondary}
                          />
                        )}
                      </Pressable>
                    }
                  >
                    <View style={notesStyles.notebookTitleRow}>
                      <NotesChevron open={isOpen} />
                      <Text
                        style={notesStyles.sectionName}
                        numberOfLines={1}
                      >
                        {notebook.name}
                      </Text>
                    </View>
                  </SwipeableTopicRow>
                )}
                {isOpen ? (
                  <View style={notesStyles.sectionBody}>
                    {notebookNotes.length === 0 ? (
                      <Text style={notesStyles.sectionEmpty}>暂无笔记</Text>
                    ) : (
                      notebookNotes.map((note) => {
                        const active = activeNoteId === note.id
                        const renaming =
                          renameTarget?.kind === 'note' && renameTarget.id === note.id
                        if (renaming) {
                          return (
                            <View
                              key={note.id}
                              style={[
                                notesStyles.renameWrap,
                                { minHeight: layout.rowMinHeight },
                                active ? notesStyles.renameWrapActive : null,
                              ]}
                            >
                              <TextInput
                                style={[
                                  notesStyles.renameInput,
                                  { fontSize: layout.topicFontSize },
                                ]}
                                value={draftTitle}
                                onChangeText={setDraftTitle}
                                autoFocus
                                selectTextOnFocus
                                returnKeyType="done"
                                onSubmitEditing={commitRename}
                                onBlur={commitRename}
                                placeholder="笔记标题"
                                placeholderTextColor={colors.textSecondary}
                                underlineColorAndroid="transparent"
                              />
                            </View>
                          )
                        }
                        return (
                          <SwipeableTopicRow
                            key={note.id}
                            active={active}
                            open={openSwipeId === noteSwipeId(note.id)}
                            onOpenChange={(open) =>
                              setOpenSwipeId(open ? noteSwipeId(note.id) : null)
                            }
                            style={notesStyles.noteSwipe}
                            renameA11yLabel="重命名笔记"
                            deleteA11yLabel="删除笔记"
                            onPress={() => {
                              setOpenSwipeId(null)
                              setActiveNoteId(note.id)
                              setLeftOpen(false)
                            }}
                            onRename={() => {
                              setOpenSwipeId(null)
                              setActiveNoteId(note.id)
                              setRenameTarget({ kind: 'note', id: note.id })
                              setDraftTitle(note.title)
                            }}
                            onDelete={() => confirmDeleteNote(note)}
                          >
                            <Text
                              style={[
                                sidebarStyles.itemLabel,
                                active ? sidebarStyles.itemLabelActive : null,
                                {
                                  fontSize: layout.topicFontSize,
                                  lineHeight: layout.topicFontSize + 6,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {note.title || '未命名笔记'}
                            </Text>
                          </SwipeableTopicRow>
                        )
                      })
                    )}
                  </View>
                ) : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function ModuleLeftPane({
  moduleId,
}: {
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community' | 'projects'>
}) {
  const copy = MODULE_COPY[moduleId]
  const { setLeftOpen } = useMobileApp()

  if (moduleId === 'notes') {
    return <NotesLeftPane />
  }

  return (
    <SidebarShell>
      <SidebarAddButton
        label={copy.addLabel}
        onPress={() => {
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        <Text style={sidebarStyles.empty}>{copy.emptyHint}</Text>
      </SidebarList>
    </SidebarShell>
  )
}

/** Content-only modules (no chat). Agent-capable modules use `AgentRightPane` instead. */
function NotesRightPane({ note }: { note: MobileNote | null }) {
  const { notes, setNotes, syncStatus, modulePrefs } = useMobileApp()
  const { width } = useWindowDimensions()
  const notesPrefs = modulePrefs.notes
  const charCount = note ? Array.from(note.body).length : 0
  const outline = note ? extractNoteOutline(note.body) : []
  const showOutline = notesPrefs.showOutline && outline.length > 0 && width >= 720
  const sideBySide = notesPrefs.openMode === 'live-preview' && width >= 900
  const showEditor = notesPrefs.openMode !== 'preview-only'
  const showPreview = notesPrefs.openMode !== 'edit-only'

  const status = useMemo(() => {
    if (!note) return { tone: 'muted' as const, message: '选择或新建笔记' }
    if (syncStatus === 'syncing') {
      return { tone: 'info' as const, message: '正在同步笔记…', meta: `${charCount} 字` }
    }
    if (syncStatus === 'error') {
      return { tone: 'error' as const, message: '笔记同步失败', meta: `${charCount} 字` }
    }
    if (syncStatus === 'offline') {
      return { tone: 'warning' as const, message: '离线，笔记仅保存在本地', meta: `${charCount} 字` }
    }
    return { tone: 'muted' as const, message: '就绪', meta: `${charCount} 字` }
  }, [charCount, note, syncStatus])

  useRegisterModulePanelStatus('notes-page', status)

  if (!note) {
    return <Text style={shellStyles.emptyHint}>选择或新建笔记</Text>
  }

  const patchNote = (patch: Partial<MobileNote>) => {
    setNotes(
      notes.map((item) =>
        item.id === note.id ? { ...item, ...patch, updatedAt: Date.now() } : item,
      ),
    )
  }

  return (
    <View style={styles.pageRow}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[
          styles.pageContent,
          notesPrefs.narrowColumn ? styles.pageContentNarrow : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // @ts-expect-error react-native-web className
        className="tm-notes-page-scroll"
      >
        <TextInput
          style={styles.titleInput}
          value={note.title}
          onChangeText={(title) => patchNote({ title })}
          placeholder="无标题"
          placeholderTextColor={colors.textSecondary}
        />
        <View style={[styles.editorSplit, sideBySide ? styles.editorSplitRow : null]}>
          {showEditor ? (
            <View style={styles.editorCol}>
              <NotesRichBodyEditor
                key={note.id}
                value={note.body}
                placeholder="写点什么…"
                fontSize={notesPrefs.fontSize}
                onChange={(body) => patchNote({ body })}
              />
            </View>
          ) : null}
          {showPreview ? (
            <View style={styles.editorCol}>
              {note.body.trim() ? (
                <MessageMarkdown text={prepareNoteMarkdown(note.body)} variant="note" />
              ) : (
                <Text style={styles.previewEmpty}>预览</Text>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
      {showOutline ? (
        <View style={styles.outline}>
          <Text style={styles.outlineTitle}>大纲</Text>
          {outline.map((item) => (
            <Text
              key={item.id}
              style={[
                styles.outlineItem,
                item.level === 2 ? styles.outlineL2 : item.level === 3 ? styles.outlineL3 : null,
              ]}
              numberOfLines={1}
            >
              {item.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function ModuleRightPane({
  moduleId,
}: {
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community' | 'projects'>
}) {
  const copy = MODULE_COPY[moduleId]
  const { notes, activeNoteId } = useMobileApp()

  if (moduleId === 'notes') {
    const note = notes.find((item) => item.id === activeNoteId) ?? notes[0] ?? null
    return <NotesRightPane note={note} />
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={shellStyles.emptyHint}>{copy.hint}</Text>
    </View>
  )
}

const notesStyles = StyleSheet.create({
  group: {
    marginBottom: 2,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  sectionName: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  notebookTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notebookRenameWrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  /** Match desktop `.tm-assistant-action-btn`. */
  actionBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  actionBtnPressed: {
    borderColor: colors.accent,
  },
  sectionBody: {
    paddingBottom: 2,
  },
  sectionEmpty: {
    marginLeft: 34,
    marginRight: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
  },
  noteSwipe: {
    marginLeft: 28,
  },
  renameWrap: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  renameWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  renameInput: {
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
  },
})

const styles = StyleSheet.create({
  pageRow: {
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
    minHeight: 0,
  },
  /** Desktop `.tm-notes-editor-pane--edit`. */
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    minWidth: 0,
  },
  pageContent: {
    flexGrow: 1,
    paddingTop: 24,
    /** Match agent stream (`STREAM_PAD_SIDE`); equal L/R so the 8px web scrollbar cannot skew the page. */
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: 16,
  },
  pageContentNarrow: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  editorSplit: {
    gap: 16,
    width: '100%',
  },
  editorSplitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  editorCol: {
    flex: 1,
    minWidth: 0,
  },
  previewEmpty: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  outline: {
    width: 180,
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: colors.bg,
    gap: 6,
  },
  outlineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  outlineItem: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
  },
  outlineL2: {
    paddingLeft: 8,
    color: colors.textSecondary,
  },
  outlineL3: {
    paddingLeft: 16,
    color: colors.textSecondary,
  },
  titleInput: {
    width: '100%',
    borderWidth: 0,
    padding: 0,
    marginBottom: 10,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    color: colors.text,
    backgroundColor: 'transparent',
    ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
  },
})
