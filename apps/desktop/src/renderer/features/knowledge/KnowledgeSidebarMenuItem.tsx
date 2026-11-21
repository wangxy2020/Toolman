import type { ReactNode } from 'react'
import { SidebarRenameInput } from '../notes/SidebarRenameInput'
import { normalizeRenameTitle } from '../notes/notes-storage'

interface Props {
  icon: ReactNode
  label: string
  active?: boolean
  title?: string
  isRenaming?: boolean
  onClick: () => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onRename?: (next: string) => void
  onCancelRename?: () => void
  onStartRename?: () => void
}

export function KnowledgeSidebarMenuItem({
  icon,
  label,
  active,
  title,
  isRenaming,
  onClick,
  onContextMenu,
  onRename,
  onCancelRename,
  onStartRename,
}: Props) {
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!onContextMenu) return
    event.preventDefault()
    event.stopPropagation()
    onContextMenu(event)
  }

  if (isRenaming && onRename && onCancelRename) {
    return (
      <SidebarRenameInput
        value={label}
        className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
        onCommit={(next) => {
          onRename(normalizeRenameTitle(next, label))
          onCancelRename()
        }}
        onCancel={onCancelRename}
      />
    )
  }

  return (
    <button
      type="button"
      className={[
        'tm-session-item',
        'tm-session-item--with-icon',
        'tm-session-item--quiet-hover',
        active ? 'tm-session-item--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      onDoubleClick={(event) => {
        if (!onStartRename) return
        event.preventDefault()
        onStartRename()
      }}
      onContextMenu={handleContextMenu}
      title={title ?? label}
    >
      <span className="tm-session-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tm-session-item-label">{label}</span>
    </button>
  )
}
