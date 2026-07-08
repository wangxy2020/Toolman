import type { MouseEvent } from 'react'
import { IconFile } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { countRestorableSnapshots } from './document-page-snapshots'
import { SidebarRenameInput } from '../notes/SidebarRenameInput'
import { normalizeRenameTitle, type TranslationDocumentItem } from './translation-storage'

interface Props {
  document: TranslationDocumentItem
  isActive: boolean
  isRenaming: boolean
  onSelect: (documentId: string) => void
  onRename: (documentId: string, title: string) => void
  onStartRename: () => void
  onCancelRename: () => void
  onContextMenu: (event: MouseEvent, document: TranslationDocumentItem) => void
}

export function TranslationSidebarDocumentItem({
  document,
  isActive,
  isRenaming,
  onSelect,
  onRename,
  onStartRename,
  onCancelRename,
  onContextMenu,
}: Props) {
  const { t } = useI18n()
  const savedPageCount = countRestorableSnapshots(document.pageSnapshots)

  if (isRenaming) {
    return (
      <SidebarRenameInput
        value={document.title}
        className="tm-sidebar-rename-input tm-sidebar-rename-input--note"
        onCommit={(next) => {
          onRename(document.id, normalizeRenameTitle(next, document.title))
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
      onClick={() => onSelect(document.id)}
      onDoubleClick={(event) => {
        event.preventDefault()
        onStartRename()
      }}
      onContextMenu={(event) => onContextMenu(event, document)}
      title={
        savedPageCount > 0
          ? t('translationPage.documents.sidebarSavedPages', { count: String(savedPageCount) })
          : document.title
      }
    >
      <span className="tm-session-item-icon" aria-hidden="true">
        <IconFile size={14} />
      </span>
      <span className="tm-session-item-label">
        {document.title}
        {savedPageCount > 0 ? (
          <span className="tm-session-item-meta"> · {savedPageCount}</span>
        ) : null}
      </span>
    </button>
  )
}
