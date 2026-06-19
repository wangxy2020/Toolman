import { useEffect, useRef, type ReactNode } from 'react'
import { IconTerminalPrompt } from '../../components/icons'

export interface InputPopupMenuItemData {
  id: string
  command: string
  description?: string
  showIcon?: boolean
}

interface ItemProps {
  command: string
  description?: string
  active?: boolean
  showIcon?: boolean
  onClick: () => void
  onMouseEnter?: () => void
}

export function InputPopupMenuRow({
  command,
  description,
  active = false,
  showIcon = true,
  onClick,
  onMouseEnter,
}: ItemProps) {
  return (
    <button
      type="button"
      className={['tm-input-popup-menu-row', active ? 'tm-input-popup-menu-row--active' : '']
        .filter(Boolean)
        .join(' ')}
      role="menuitem"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="tm-input-popup-menu-row-left">
        {showIcon ? <IconTerminalPrompt size={14} /> : null}
        <span className="tm-input-popup-menu-row-command">{command}</span>
      </span>
      {description ? (
        <span className="tm-input-popup-menu-row-desc">{description}</span>
      ) : null}
    </button>
  )
}

interface MenuProps {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function InputPopupMenu({ title, open, onClose, children }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
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
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="tm-input-popup-menu" ref={menuRef} role="menu" aria-label={title}>
      <div className="tm-input-popup-menu-body">{children}</div>
      <div className="tm-input-popup-menu-footer">
        <span className="tm-input-popup-menu-footer-title">{title}</span>
        <div className="tm-input-popup-menu-shortcuts">
          <span className="tm-input-popup-menu-kbd">ESC 关闭</span>
          <span className="tm-input-popup-menu-kbd">▲▼ 选择</span>
          <span className="tm-input-popup-menu-kbd">⌘ + ▲▼ 翻页</span>
          <span className="tm-input-popup-menu-kbd">↵ 确认</span>
        </div>
      </div>
    </div>
  )
}

interface ListProps {
  items: InputPopupMenuItemData[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (index: number) => void
}

export function InputPopupMenuList({
  items,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: ListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const row = listRef.current?.children[activeIndex] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="tm-input-popup-menu-list" ref={listRef}>
      {items.map((item, index) => (
        <InputPopupMenuRow
          key={item.id}
          command={item.command}
          description={item.description}
          showIcon={item.showIcon}
          active={index === activeIndex}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(index)}
        />
      ))}
    </div>
  )
}
