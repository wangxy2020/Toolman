import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onAddToKnowledge: () => void
  onAddToNotes: () => void
  onDelete: () => void
}

export function TranslationSidebarContextMenu({
  x,
  y,
  onClose,
  onRename,
  onAddToKnowledge,
  onAddToNotes,
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

  return createPortal(
    <>
      <button
        type="button"
        className="tm-group-context-menu-backdrop"
        aria-label={t('translationPage.sidebar.closeMenu')}
        onClick={onClose}
      />
      <div className="tm-group-context-menu" style={{ top: y, left: x }} role="menu">
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onRename()
            onClose()
          }}
        >
          {t('translationPage.sidebar.rename')}
        </button>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onAddToKnowledge()
            onClose()
          }}
        >
          {t('translationPage.sidebar.addToKnowledge')}
        </button>
        <button
          type="button"
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onAddToNotes()
            onClose()
          }}
        >
          {t('translationPage.sidebar.addToNotes')}
        </button>
        <button
          type="button"
          className={['tm-group-context-menu-item', 'tm-group-context-menu-item--danger'].join(' ')}
          role="menuitem"
          onClick={() => {
            onDelete()
            onClose()
          }}
        >
          {t('translationPage.sidebar.delete')}
        </button>
      </div>
    </>,
    document.body,
  )
}
