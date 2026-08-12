import { useMemo, useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
  type MobileNote,
} from '../storage/notes'
import { colors, shellStyles } from '../theme'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SwipeableTopicRow } from './SwipeableTopicRow'

const MODULE_COPY: Record<
  Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community'>,
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
  projects: {
    listTitle: '项目',
    hint: '轻量看板/任务；可经桌面宿主调用项目管理智能体。',
    addLabel: '新建项目',
    emptyHint: '暂无项目',
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
  const [renamingId, setRenamingId] = useState<string | null>(null)
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
    setRenamingId(null)
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
    setRenamingId(null)
    setLeftOpen(false)
  }

  const commitRename = (noteId: string) => {
    const next = draftTitle.trim()
    if (next) {
      setNotes(
        notes.map((item) =>
          item.id === noteId ? { ...item, title: next, updatedAt: Date.now() } : item,
        ),
      )
    }
    setRenamingId(null)
    setDraftTitle('')
  }

  const deleteNote = (note: MobileNote) => {
    const remaining = notes.filter((item) => item.id !== note.id)
    setNotes(remaining)
    if (activeNoteId === note.id) {
      const sameNotebook = remaining.find((item) => item.notebookId === note.notebookId)
      setActiveNoteId(sameNotebook?.id ?? remaining[0]?.id ?? null)
    }
    if (renamingId === note.id) {
      setRenamingId(null)
      setDraftTitle('')
    }
    setOpenSwipeId(null)
  }

  const confirmDelete = (note: MobileNote) => {
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
            return (
              <View key={notebook.id} style={notesStyles.group}>
                <View
                  style={[
                    notesStyles.sectionRow,
                    isActive ? notesStyles.sectionRowActive : null,
                  ]}
                >
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠笔记本' : '展开笔记本'}
                    onPress={() => toggleExpanded(notebook.id)}
                    style={({ pressed }) => [
                      notesStyles.expandHit,
                      pressed ? notesStyles.expandHitPressed : null,
                    ]}
                  >
                    <NotesChevron open={isOpen} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => toggleExpanded(notebook.id)}
                    style={notesStyles.sectionNameHit}
                  >
                    <Text
                      style={[
                        notesStyles.sectionName,
                        isActive ? notesStyles.sectionNameActive : null,
                      ]}
                      numberOfLines={1}
                    >
                      {notebook.name}
                    </Text>
                  </Pressable>
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
                </View>
                {isOpen ? (
                  <View style={notesStyles.sectionBody}>
                    {notebookNotes.length === 0 ? (
                      <Text style={notesStyles.sectionEmpty}>暂无笔记</Text>
                    ) : (
                      notebookNotes.map((note) => {
                        const active = activeNoteId === note.id
                        const renaming = renamingId === note.id
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
                                onSubmitEditing={() => commitRename(note.id)}
                                onBlur={() => commitRename(note.id)}
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
                            open={openSwipeId === note.id}
                            onOpenChange={(open) => setOpenSwipeId(open ? note.id : null)}
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
                              setRenamingId(note.id)
                              setDraftTitle(note.title)
                            }}
                            onDelete={() => confirmDelete(note)}
                          >
                            <Text
                              style={[
                                sidebarStyles.itemLabel,
                                active ? sidebarStyles.itemLabelActive : null,
                                { fontSize: layout.topicFontSize, lineHeight: layout.topicFontSize + 6 },
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
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community'>
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
export function ModuleRightPane({
  moduleId,
}: {
  moduleId: Exclude<MobileModuleId, 'agent' | 'knowledge' | 'group' | 'community'>
}) {
  const copy = MODULE_COPY[moduleId]
  const { notes, setNotes, activeNoteId } = useMobileApp()

  if (moduleId === 'notes') {
    const note = notes.find((item) => item.id === activeNoteId) ?? notes[0] ?? null
    if (!note) {
      return <Text style={shellStyles.emptyHint}>选择或新建笔记</Text>
    }
    return (
      <View style={{ flex: 1, padding: 14, gap: 8 }}>
        <TextInput
          style={styles.titleInput}
          value={note.title}
          onChangeText={(title) =>
            setNotes(
              notes.map((item) =>
                item.id === note.id ? { ...item, title, updatedAt: Date.now() } : item,
              ),
            )
          }
        />
        <TextInput
          style={styles.bodyInput}
          multiline
          value={note.body}
          onChangeText={(body) =>
            setNotes(
              notes.map((item) =>
                item.id === note.id ? { ...item, body, updatedAt: Date.now() } : item,
              ),
            )
          }
          placeholder="写点什么…"
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    )
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
  sectionRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 8,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionRowActive: {
    // Match desktop `.tm-assistant-row--active` → `--tm-hover`
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
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
  sectionNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
    minWidth: 0,
  },
  sectionName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  sectionNameActive: {
    color: colors.text,
    fontWeight: '500',
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
  titleInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  bodyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    /** Match desktop `.tm-notes-editor-body` line-height: 1.7. */
    lineHeight: 26,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
})
