import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  x: number
  y: number
  selectedCount: number
  documentCount: number
  reindexAllDisabled?: boolean
  onClose: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onReindexAll?: () => void
}

export function KnowledgeFileContextMenu({
  x,
  y,
  selectedCount,
  documentCount,
  reindexAllDisabled = false,
  onClose,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onReindexAll,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (documentCount === 0) return null

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
          删除已勾选{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
        {onReindexAll ? (
          <button
            type="button"
            className="tm-group-context-menu-item"
            role="menuitem"
            disabled={reindexAllDisabled}
            onClick={() => {
              if (reindexAllDisabled) return
              onReindexAll()
              onClose()
            }}
          >
            全部重建索引
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
