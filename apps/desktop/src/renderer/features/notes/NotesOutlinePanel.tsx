import type { NoteOutlineItem } from './notes-outline'

interface Props {
  items: NoteOutlineItem[]
  onSelect: (item: NoteOutlineItem) => void
}

export function NotesOutlinePanel({ items, onSelect }: Props) {
  return (
    <aside className="tm-notes-outline" aria-label="笔记大纲">
      <h3 className="tm-notes-outline-title">大纲</h3>
      {items.length === 0 ? (
        <p className="tm-notes-outline-empty">暂无标题</p>
      ) : (
        <nav className="tm-notes-outline-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                'tm-notes-outline-item',
                `tm-notes-outline-item--level-${item.level}`,
              ].join(' ')}
              title={item.text}
              onClick={() => onSelect(item)}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  )
}
