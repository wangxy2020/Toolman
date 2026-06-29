import { useMemo } from 'react'
import type { GroupPickerGroup } from './group-resource-picker-types'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'
import { useI18n } from '../../i18n/useI18n'
import { translateNotebookName } from '../../i18n/system-labels'

interface Props {
  notebooks: NotebookItem[]
  notes: NoteItem[]
  sharedNoteIds?: Set<string>
  onClose: () => void
  onConfirm: (selections: Array<{ notebookId: string; noteIds: string[] }>) => Promise<void>
}

export function GroupNotePickerModal({
  notebooks,
  notes,
  sharedNoteIds = new Set(),
  onClose,
  onConfirm,
}: Props) {
  const { t } = useI18n()
  const groups = useMemo<GroupPickerGroup[]>(() => {
    const result: GroupPickerGroup[] = []

    for (const notebook of notebooks) {
      const notebookNotes = notes.filter(
        (note) => note.notebookId === notebook.id && !sharedNoteIds.has(note.id),
      )
      if (notebookNotes.length === 0) continue

      result.push({
        id: notebook.id,
        name: translateNotebookName(notebook.name, t),
        description: t('groupPage.picker.note.noteCount', { count: notebookNotes.length }),
        groupSelectable: true,
        items: notebookNotes.map((note) => ({
          id: note.id,
          name: note.title,
          meta: note.tags.length > 0 ? note.tags.slice(0, 3).join(' · ') : undefined,
        })),
      })
    }

    return result
  }, [notebooks, notes, sharedNoteIds, t])

  return (
    <GroupResourcePickerModal
      title={t('groupPage.picker.note.title')}
      hint={t('groupPage.picker.note.hint')}
      confirmLabel={t('groupPage.picker.add')}
      groups={groups}
      onClose={onClose}
      onConfirm={async (selection) => {
        const payload = selection
          .map((item) => {
            const group = groups.find((entry) => entry.id === item.groupId)
            const noteIds =
              item.itemIds.length > 0
                ? item.itemIds
                : (group?.items.map((note) => note.id) ?? [])
            return {
              notebookId: item.groupId,
              noteIds,
            }
          })
          .filter((item) => item.noteIds.length > 0)

        if (payload.length === 0) {
          throw new Error(t('groupPage.picker.note.noneAvailable'))
        }

        await onConfirm(payload)
      }}
    />
  )
}
