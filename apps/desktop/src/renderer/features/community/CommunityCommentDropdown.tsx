import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CommunityCommentPanel } from './CommunityCommentPanel'
import type { CommunityCommentTarget } from './community-comment-utils'

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>
  target: CommunityCommentTarget
  open: boolean
  onClose: () => void
  onCountChange?: (count: number) => void
}

const DROPDOWN_GAP = 6
const MIN_DROPDOWN_HEIGHT = 200
const VIEWPORT_PADDING = 12

function measureDropdownLayout(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(
    Math.max(rect.width, 320),
    window.innerWidth - VIEWPORT_PADDING * 2,
  )

  let left = rect.left
  left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - width - VIEWPORT_PADDING))

  const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP - VIEWPORT_PADDING
  const spaceAbove = rect.top - DROPDOWN_GAP - VIEWPORT_PADDING
  const openBelow = spaceBelow >= spaceAbove
  const availableHeight = Math.max(
    MIN_DROPDOWN_HEIGHT,
    openBelow ? spaceBelow : spaceAbove,
  )

  let top = openBelow
    ? rect.bottom + DROPDOWN_GAP
    : rect.top - availableHeight - DROPDOWN_GAP

  top = Math.max(
    VIEWPORT_PADDING,
    Math.min(top, window.innerHeight - availableHeight - VIEWPORT_PADDING),
  )

  return { top, left, width, height: availableHeight }
}

export function CommunityCommentDropdown({
  anchorRef,
  target,
  open,
  onClose,
  onCountChange,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setLayout(null)
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      setLayout(measureDropdownLayout(anchor))
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
      const node = event.target as Node
      if (menuRef.current?.contains(node)) return
      if (anchorRef.current?.contains(node)) return
      if ((event.target as Element).closest?.('.tm-emoji-picker')) return
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
      ref={menuRef}
      className="tm-community-comment-dropdown"
      role="dialog"
      aria-label="评论区"
      style={
        layout
          ? {
              top: layout.top,
              left: layout.left,
              width: layout.width,
              height: layout.height,
            }
          : { visibility: 'hidden', top: 0, left: 0, width: 320, height: MIN_DROPDOWN_HEIGHT }
      }
    >
      <CommunityCommentPanel
        target={target}
        open={open}
        onClose={onClose}
        onCountChange={onCountChange}
      />
    </div>,
    document.body,
  )
}
