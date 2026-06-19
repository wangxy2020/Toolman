import { getBacklinks, getOutlinks } from './notes-links'
import type { NoteItem } from './notes-storage'

interface Props {
  note: NoteItem
  notes: NoteItem[]
  onSelectNote: (noteId: string) => void
}

export function NotesBacklinksPanel({ note, notes, onSelectNote }: Props) {
  const backlinks = getBacklinks(note.id, notes)
  const outlinks = getOutlinks(note, notes)

  if (backlinks.length === 0 && outlinks.length === 0) {
    return null
  }

  return (
    <aside className="tm-notes-backlinks">
      {outlinks.length > 0 ? (
        <section className="tm-notes-backlinks-section">
          <h3 className="tm-notes-backlinks-title">出站链接</h3>
          <div className="tm-notes-backlinks-list">
            {outlinks.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tm-notes-backlinks-item"
                onClick={() => onSelectNote(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {backlinks.length > 0 ? (
        <section className="tm-notes-backlinks-section">
          <h3 className="tm-notes-backlinks-title">反向链接</h3>
          <div className="tm-notes-backlinks-list">
            {backlinks.map((item) => (
              <button
                key={item.id}
                type="button"
                className="tm-notes-backlinks-item"
                onClick={() => onSelectNote(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  )
}
