import { ScrollView, Text, TextInput, View } from 'react-native'
import { colors, shellStyles } from '../theme'
import { NotesRichBodyEditor } from './NotesRichBodyEditor'
import { prepareNoteMarkdown } from './noteBodyDisplay'
import { MessageMarkdown } from './MessageMarkdown'
import { useNotesRightPane } from './useNotesRightPane'
import { notesStyles as styles } from './ModulePanesNotesStyles'

export function NotesRightPane() {
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
