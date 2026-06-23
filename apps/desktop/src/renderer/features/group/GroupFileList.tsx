import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuProps {
  x: number
  y: number
  selectedCount: number
  enabled?: boolean
  canDelete: boolean
  deleteLabel?: string
  onClose: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
}

export function GroupFileContextMenu({
  x,
  y,
  selectedCount,
  enabled = true,
  canDelete,
  deleteLabel = '移除已勾选',
  onClose,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
}: ContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!enabled) return null

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onSelectAll()
            onClose()
          }}
        >
          全选
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onClearSelection()
            onClose()
          }}
        >
          取消
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            'tm-group-context-menu-item--danger',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onDeleteSelected()
            onClose()
          }}
        >
          {deleteLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
      </div>
    </>,
    document.body,
  )
}
