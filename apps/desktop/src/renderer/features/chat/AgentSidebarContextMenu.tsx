import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  x: number
  y: number
  canRename?: boolean
  canDelete?: boolean
  onClose: () => void
  onRename?: () => void
  onDelete?: () => void
}

export function AgentSidebarContextMenu({
  x,
  y,
  canRename = true,
  canDelete = true,
  onClose,
  onRename,
  onDelete,
}: Props) {
  const { t } = useI18n()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!canRename && !canDelete) return null

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label={t('sidebar.agent.closeMenu')}
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        {canRename && onRename ? (
          <button
            type="button"
            className="tm-group-context-menu-item"
            role="menuitem"
            onClick={() => {
              onRename()
              onClose()
            }}
          >
            {t('sidebar.agent.rename')}
          </button>
        ) : null}
        {canDelete && onDelete ? (
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
            {t('sidebar.agent.delete')}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
