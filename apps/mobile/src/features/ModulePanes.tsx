import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { MobileModuleId } from '../modules'
import { IconPlus } from '../icons/composer-icons'
import { useSidebarLayout } from '../layout'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { NotesRichBodyEditor } from './NotesRichBodyEditor'
import { prepareNoteMarkdown } from './noteBodyDisplay'
import { MessageMarkdown } from './MessageMarkdown'
import {
  MODULE_COPY,
  notebookSwipeId,
  noteSwipeId,
} from './notesPaneUtils'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SwipeableTopicRow } from './SwipeableTopicRow'
import { useNotesLeftPane } from './useNotesLeftPane'
import { useNotesRightPane } from './useNotesRightPane'

function NotesChevron({ open }: { open: boolean }) {
  return (
    <Text style={[notesStyles.chevron, open ? notesStyles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

function NotesLeftPane() {
  const layout = useSidebarLayout()
  const {
    notebooks,
    notesByNotebook,
    activeNoteId,
    activeNotebookId,
    expanded,
    renameTarget,
    draftTitle,
    setDraftTitle,
    openSwipeId,
    createNotebook,
    createNote,
    commitRename,
    confirmDeleteNote,
    confirmDeleteNotebook,
    isProtectedNotebook,
    onNotebookPress,
    beginRenameNotebook,
    selectNote,
    beginRenameNote,
    setSwipeOpen,
  } = useNotesLeftPane()

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
                    onOpenChange={(open) => setSwipeOpen(notebookSwipeId(notebook.id), open)}
                    renameA11yLabel="重命名笔记本"
                    deleteA11yLabel="删除笔记本"
                    onPress={() => onNotebookPress(notebook.id)}
                    onRename={() => beginRenameNotebook(notebook)}
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
                            onOpenChange={(open) => setSwipeOpen(noteSwipeId(note.id), open)}
                            style={notesStyles.noteSwipe}
                            renameA11yLabel="重命名笔记"
                            deleteA11yLabel="删除笔记"
                            onPress={() => selectNote(note)}
                            onRename={() => beginRenameNote(note)}
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
function NotesRightPane() {
  const {
    note,
    notesPrefs,
    outline,
    showOutline,
    sideBySide,
    showEditor,
    showPreview,
    patchNote,
  } = useNotesRightPane()

  if (!note) {
    return <Text style={shellStyles.emptyHint}>选择或新建笔记</Text>
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

  if (moduleId === 'notes') {
    return <NotesRightPane />
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
