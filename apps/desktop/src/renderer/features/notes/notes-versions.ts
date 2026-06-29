import {
  createVersionId,
  MAX_NOTE_VERSIONS,
  type NoteItem,
  type NoteVersion,
} from './notes-storage'

export function appendNoteVersion(note: NoteItem): NoteVersion[] {
  const versions = note.versions ?? []
  const latest = versions[0]
  if (latest && latest.title === note.title && latest.content === note.content) {
    return versions
  }

  const version: NoteVersion = {
    id: createVersionId(),
    title: note.title,
    content: note.content,
    createdAt: Date.now(),
  }

  return [version, ...versions].slice(0, MAX_NOTE_VERSIONS)
}
