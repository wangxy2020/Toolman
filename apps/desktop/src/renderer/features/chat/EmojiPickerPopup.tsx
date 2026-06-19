import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GROUP_CHAT_EMOJIS } from './group-chat-emojis'

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onSelect: (emoji: string) => void
}

export function EmojiPickerPopup({ open, anchorRef, onClose, onSelect }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const menu = menuRef.current
      const width = menu?.offsetWidth ?? 280
      const height = menu?.offsetHeight ?? 200
      const gap = 6

      let left = rect.left
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
  }, [anchorRef, open])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef, onClose, open])

  if (!open) return null

  return createPortal(
    <div
      className="tm-emoji-picker"
      ref={menuRef}
      role="menu"
      aria-label="表情"
      style={
        position
          ? { top: position.top, left: position.left }
          : { visibility: 'hidden', top: 0, left: 0 }
      }
    >
      <div className="tm-emoji-picker-grid">
        {GROUP_CHAT_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="tm-emoji-picker-item"
            title={emoji}
            aria-label={emoji}
            onClick={() => {
              onSelect(emoji)
              onClose()
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
