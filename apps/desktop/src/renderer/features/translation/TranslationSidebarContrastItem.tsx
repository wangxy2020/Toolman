import type { MouseEvent } from 'react'
import { IconTranslate } from '../../components/icons'
import { SidebarRenameInput } from '../notes/SidebarRenameInput'
import { normalizeRenameTitle, type TranslationContrastItem } from './translation-storage'

interface Props {
  contrast: TranslationContrastItem
  isActive: boolean
  isRenaming: boolean
  onSelect: (contrastId: string) => void
  onRename: (contrastId: string, title: string) => void
  onStartRename: () => void
  onCancelRename: () => void
  onContextMenu: (event: MouseEvent, contrast: TranslationContrastItem) => void
}

export function TranslationSidebarContrastItem({
  contrast,
  isActive,
  isRenaming,
  onSelect,
  onRename,
  onStartRename,
  onCancelRename,
  onContextMenu,
}: Props) {
  if (isRenaming) {
    return (
      <SidebarRenameInput
        value={contrast.title}
        className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
        onCommit={(next) => {
          onRename(contrast.id, normalizeRenameTitle(next, contrast.title))
          onCancelRename()
        }}
        onCancel={onCancelRename}
      />
    )
  }

  return (
    <button
      type="button"
      className={[
        'tm-session-item',
        'tm-session-item--with-icon',
        isActive ? 'tm-session-item--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(contrast.id)}
      onDoubleClick={(event) => {
        event.preventDefault()
        onStartRename()
      }}
      onContextMenu={(event) => onContextMenu(event, contrast)}
    >
      <span className="tm-session-item-icon" aria-hidden="true">
        <IconTranslate size={14} />
      </span>
      <span className="tm-session-item-label">{contrast.title}</span>
    </button>
  )
}
