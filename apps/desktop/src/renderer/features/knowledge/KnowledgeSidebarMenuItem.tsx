import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  active?: boolean
  title?: string
  onClick: () => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function KnowledgeSidebarMenuItem({
  icon,
  label,
  active,
  title,
  onClick,
  onContextMenu,
}: Props) {
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!onContextMenu) return
    event.preventDefault()
    event.stopPropagation()
    onContextMenu(event)
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
