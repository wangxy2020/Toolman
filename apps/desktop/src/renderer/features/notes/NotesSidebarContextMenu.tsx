import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  x: number
  y: number
  canDelete: boolean
  canIngest: boolean
  deleteLabel: string
  onClose: () => void
  onDelete: () => void
  onIngest: () => void
}

export function NotesSidebarContextMenu({
  x,
  y,
  canDelete,
  canIngest,
  deleteLabel,
  onClose,
  onDelete,
  onIngest,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!canDelete && !canIngest) return null

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        {canIngest ? (
          <button
            type="button"
            className="tm-group-context-menu-item"
            role="menuitem"
            onClick={() => {
              onIngest()
              onClose()
            }}
          >
            添加到知识库
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className={[
              'tm-group-context-menu-item',
              'tm-group-context-menu-item--danger',
            ].join(' ')}
            role="menuitem"
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            {deleteLabel}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
