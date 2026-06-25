import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  anchorEl: HTMLElement
  onConfirm: () => void
  onCancel: () => void
}

export function MessageDeleteConfirmPopover({ anchorEl, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect()
      const popover = popoverRef.current
      const width = popover?.offsetWidth ?? 280
      const height = popover?.offsetHeight ?? 120
      const gap = 10

      let left = rect.left + rect.width / 2 - width / 2
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))

      let top = rect.top - height - gap
      if (top < 12) {
        top = rect.bottom + gap
      }

      setPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorEl])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target) || anchorEl.contains(target)) return
      onCancel()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [anchorEl, onCancel])

  return createPortal(
    <div
      ref={popoverRef}
      className="tm-message-delete-confirm"
      style={
        position
          ? { top: position.top, left: position.left }
          : { visibility: 'hidden', top: 0, left: 0 }
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="tm-message-delete-confirm-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="tm-message-delete-confirm-body">
        <span className="tm-message-delete-confirm-icon" aria-hidden="true">
          !
        </span>
        <p id="tm-message-delete-confirm-title" className="tm-message-delete-confirm-text">
          {t('chat.deleteMessageConfirm')}
        </p>
      </div>
      <div className="tm-message-delete-confirm-actions">
        <button type="button" className="tm-btn tm-btn--ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="tm-btn tm-message-delete-confirm-submit" onClick={onConfirm}>
          {t('chat.confirm')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
