import { Pressable, Text, TextInput, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import { useSidebarLayout } from '../layout'
import { colors } from '../theme'
import { notesStyles } from './ModulePanesNotesStyles'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SidebarSectionRow } from './SidebarSectionRow'
import { SwipeableTopicRow } from './SwipeableTopicRow'
import { noteSwipeId } from './notesPaneUtils'
import { useNotesLeftPane } from './useNotesLeftPane'

function NotesChevron({ open }: { open: boolean }) {
  return (
    <Text style={[notesStyles.chevron, open ? notesStyles.chevronOpen : null]} accessibilityElementsHidden>
      ›
    </Text>
  )
}

export function NotesLeftPane() {
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
            const canDeleteNotebook = !isProtectedNotebook(notebook.id)
            return (
              <View key={notebook.id} style={notesStyles.group}>
                <SidebarSectionRow
                  active={isActive}
                  onPress={() => onNotebookPress(notebook.id)}
                  onLongPress={
                    canDeleteNotebook
                      ? () => confirmDeleteNotebook(notebook.id, notebook.name)
                      : undefined
                  }
                  longPressA11yLabel={notebook.name}
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
                    <Text style={notesStyles.sectionName} numberOfLines={1}>
                      {notebook.name}
                    </Text>
                  </View>
                </SidebarSectionRow>
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
