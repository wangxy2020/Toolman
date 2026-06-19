import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  label: string
  active?: boolean
  title?: string
  onClick: () => void
  deletable?: boolean
  onRequestDelete?: () => void
}

export function KnowledgeSidebarMenuItem({
  icon,
  label,
  active,
  title,
  onClick,
  deletable = false,
  onRequestDelete,
}: Props) {
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (deletable && onRequestDelete) {
      onRequestDelete()
    }
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
