import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  x: number
  y: number
  onClose: () => void
  onDelete: () => void
}

export function KnowledgeSidebarContextMenu({ x, y, onClose, onDelete }: Props) {
  const { t } = useI18n()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label={t('knowledgePage.contextMenu.closeMenu')}
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
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
          {t('common.delete')}
        </button>
      </div>
    </>,
    document.body,
  )
}
