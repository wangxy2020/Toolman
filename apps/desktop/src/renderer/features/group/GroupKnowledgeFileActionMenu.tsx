import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { IconCheck } from '../../components/icons'

interface Props {
  x: number
  y: number
  align?: 'bottom-start'
  onClose: () => void
  onSaveAs: () => void | Promise<void>
}

export function GroupKnowledgeFileActionMenu({
  x,
  y,
  align = 'bottom-start',
  onClose,
  onSaveAs,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const menuStyle: CSSProperties =
    align === 'bottom-start'
      ? { top: y, left: x, transform: 'translateX(-100%)' }
      : { top: y, left: x }

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={menuStyle} role="menu">
        <button
          type="button"
          className="tm-group-context-menu-item tm-group-context-menu-item--checkable tm-group-context-menu-item--active tm-group-context-menu-item--disabled"
          role="menuitemradio"
          aria-checked
          disabled
        >
          <span className="tm-group-context-menu-item-label">仅阅读</span>
          <span className="tm-group-context-menu-item-check" aria-hidden="true">
            <IconCheck size={14} />
          </span>
        </button>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            void onSaveAs()
            onClose()
          }}
        >
          另存为
        </button>
      </div>
    </>,
    document.body,
  )
}
