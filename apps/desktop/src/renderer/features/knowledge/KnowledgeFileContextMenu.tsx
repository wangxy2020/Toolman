import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KnowledgeBase } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import type { SyncMoveTarget } from './knowledge-move-to-sync'

interface Props {
  x: number
  y: number
  selectedCount: number
  documentCount: number
  reindexAllDisabled?: boolean
  syncMoveTargets: KnowledgeBase[]
  showDefaultSyncTarget?: boolean
  onClose: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onReindexAll?: () => void
  onMoveToSync?: (target: SyncMoveTarget) => void
}

export function KnowledgeFileContextMenu({
  x,
  y,
  selectedCount,
  documentCount,
  reindexAllDisabled = false,
  syncMoveTargets,
  showDefaultSyncTarget = true,
  onClose,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onReindexAll,
  onMoveToSync,
}: Props) {
  const { t } = useI18n()
  const [syncMenuOpen, setSyncMenuOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const hasSyncTargets = showDefaultSyncTarget || syncMoveTargets.length > 0
  const moveDisabled = selectedCount === 0 || !onMoveToSync

  const syncTargetButtons = useMemo(() => {
    const items: Array<{ key: string; label: string; target: SyncMoveTarget }> = []
    if (showDefaultSyncTarget) {
      items.push({
        key: 'default',
        label: t('knowledgePage.contextMenu.moveToSyncDefault'),
        target: { type: 'default' },
      })
    }
    for (const kb of syncMoveTargets) {
      items.push({
        key: kb.id,
        label: kb.name,
        target: { type: 'kb', kb },
      })
    }
    return items
  }, [showDefaultSyncTarget, syncMoveTargets, t])

  if (documentCount === 0) return null

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
          className="tm-group-context-menu-item"
          role="menuitem"
          onClick={() => {
            onSelectAll()
            onClose()
          }}
        >
          {t('knowledgePage.contextMenu.selectAll')}
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onClearSelection()
            onClose()
          }}
        >
          {t('knowledgePage.contextMenu.clearSelection')}
        </button>
        <button
          type="button"
          className={[
            'tm-group-context-menu-item',
            'tm-group-context-menu-item--danger',
            selectedCount === 0 ? 'tm-group-context-menu-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menuitem"
          disabled={selectedCount === 0}
          onClick={() => {
            if (selectedCount === 0) return
            onDeleteSelected()
            onClose()
          }}
        >
          {t('knowledgePage.contextMenu.deleteSelected')}
          {selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>
        {onMoveToSync ? (
          <div className="tm-group-context-menu-flyout">
            <button
              type="button"
              className={[
                'tm-group-context-menu-item',
                'tm-group-context-menu-item--submenu',
                moveDisabled ? 'tm-group-context-menu-item--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={syncMenuOpen}
              disabled={moveDisabled}
              onClick={() => {
                if (moveDisabled) return
                setSyncMenuOpen((open) => !open)
              }}
            >
              {t('knowledgePage.contextMenu.moveToSync')}
              <span aria-hidden="true">›</span>
            </button>
            {syncMenuOpen ? (
              <div className="tm-group-context-menu tm-group-context-menu--submenu" role="menu">
                {!hasSyncTargets ? (
                  <div className="tm-group-context-menu-empty">
                    {t('knowledgePage.contextMenu.moveToSyncEmpty')}
                  </div>
                ) : (
                  syncTargetButtons.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="tm-group-context-menu-item"
                      role="menuitem"
                      onClick={() => {
                        onMoveToSync(item.target)
                        onClose()
                      }}
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {onReindexAll ? (
          <button
            type="button"
            className="tm-group-context-menu-item"
            role="menuitem"
            disabled={reindexAllDisabled}
            onClick={() => {
              if (reindexAllDisabled) return
              onReindexAll()
              onClose()
            }}
          >
            {t('knowledgePage.contextMenu.reindexAll')}
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
