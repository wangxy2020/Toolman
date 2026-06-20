import { useMemo } from 'react'
import type { GroupPickerGroup } from './group-resource-picker-types'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'

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
  const groups = useMemo<GroupPickerGroup[]>(() => {
    const result: GroupPickerGroup[] = []

    for (const notebook of notebooks) {
      const notebookNotes = notes.filter(
        (note) => note.notebookId === notebook.id && !sharedNoteIds.has(note.id),
      )
      if (notebookNotes.length === 0) continue

      result.push({
        id: notebook.id,
        name: notebook.name,
        description: `${notebookNotes.length} 篇笔记`,
        groupSelectable: true,
        items: notebookNotes.map((note) => ({
          id: note.id,
          name: note.title,
          meta: note.tags.length > 0 ? note.tags.slice(0, 3).join(' · ') : undefined,
        })),
      })
    }

    return result
  }, [notebooks, notes, sharedNoteIds])

  return (
    <GroupResourcePickerModal
      title="选择笔记"
      hint="展开笔记本可查看笔记，勾选笔记本将全选其中笔记，也可单独勾选笔记。"
      confirmLabel="添加"
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
          throw new Error('没有可添加的笔记')
        }

        await onConfirm(payload)
      }}
    />
  )
}
