import type { KnowledgeBase } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconChevronRight, IconPlus } from '../../components/icons'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { useState } from 'react'
import { KNOWLEDGE_SIDEBAR_SECTIONS, type KnowledgeSidebarSection, isDeletableSavedSharedKnowledgeBase } from './knowledge-sidebar-types'
import { KnowledgeSidebarContextMenu } from './KnowledgeSidebarContextMenu'
import {
  KnowledgeSidebarSectionBody,
  useKnowledgeSidebarExpansion,
  useKnowledgeSidebarItems,
} from './KnowledgeSidebarSectionBody'

interface Props {
  items: KnowledgeBase[]
  activeId: string | null
  activeSection: KnowledgeSidebarSection
  loading?: boolean
  onSelect: (id: string) => void
  onSelectDefaultFolder: () => void
  onSelectDefaultNetworkFolder: () => void
  onSelectDefaultLocalFilesFolder: () => void
  onSelectFileRegistry: () => void
  onSelectFileDedup: () => void
  onSelectSection: (section: KnowledgeSidebarSection) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export function KnowledgeSidebar({
  items,
  activeId,
  activeSection,
  loading,
  onSelect,
  onSelectDefaultFolder,
  onSelectDefaultNetworkFolder,
  onSelectDefaultLocalFilesFolder,
  onSelectFileRegistry,
  onSelectFileDedup,
  onSelectSection,
  onCreate,
  onDelete,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('knowledge', t)
  const { localItems, networkItems, localFilesItems, savedSharedItems } =
    useKnowledgeSidebarItems(items)
  const { expanded, toggleExpanded, expandSection } = useKnowledgeSidebarExpansion(activeId, activeSection)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null)
  const [deleteContextMenu, setDeleteContextMenu] = useState<{
    item: KnowledgeBase
    x: number
    y: number
  } | null>(null)

  const suppressContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
  }

  const defaultFolderLabel = t('sidebar.knowledge.defaultFolder')

  const handleSectionClick = (section: KnowledgeSidebarSection) => {
    onSelectSection(section)
    expandSection(section)
  }

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreate}>
          <IconPlus />
          {config.addLabel}
        </button>

        <div className="tm-sidebar-list">
          {loading && localItems.length === 0 && activeSection === 'local' && (
            <div className="tm-empty">{t('common.loading')}</div>
          )}

          {KNOWLEDGE_SIDEBAR_SECTIONS.map((section) => {
            const sectionLabel = getKnowledgeSidebarSectionLabel(section.id, t)
            const isOpen = expanded.has(section.id)
            const isActive = activeSection === section.id

            return (
              <div key={section.id} className="tm-assistant-group">
                <div
                  className={[
                    'tm-assistant-row',
                    isOpen ? 'tm-assistant-row--open' : '',
                    isActive ? 'tm-assistant-row--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <button
                    type="button"
                    className="tm-assistant-expand"
                    title={isOpen ? t('common.collapse') : t('common.expand')}
                    onClick={() => toggleExpanded(section.id)}
                    onContextMenu={suppressContextMenu}
                  >
                    <IconChevronRight open={isOpen} />
                  </button>
                  <button
                    type="button"
                    className={[
                      'tm-assistant-name',
                      isActive ? 'tm-assistant-name--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleSectionClick(section.id)}
                    onContextMenu={suppressContextMenu}
                  >
                    {sectionLabel}
                  </button>
                  <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
                </div>

                {isOpen ? (
                  <KnowledgeSidebarSectionBody
                    section={section.id}
                    loading={loading}
                    activeId={activeId}
                    activeSection={activeSection}
                    localItems={localItems}
                    networkItems={networkItems}
                    localFilesItems={localFilesItems}
                    savedSharedItems={savedSharedItems}
                    defaultFolderLabel={defaultFolderLabel}
                    onSelect={onSelect}
                    onSelectDefaultFolder={onSelectDefaultFolder}
                    onSelectDefaultNetworkFolder={onSelectDefaultNetworkFolder}
                    onSelectDefaultLocalFilesFolder={onSelectDefaultLocalFilesFolder}
                    onSelectFileRegistry={onSelectFileRegistry}
                    onSelectFileDedup={onSelectFileDedup}
                    onRequestDelete={(item, event) => {
                      setDeleteContextMenu({
                        item,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {deleteContextMenu ? (
        <KnowledgeSidebarContextMenu
          x={deleteContextMenu.x}
          y={deleteContextMenu.y}
          onClose={() => setDeleteContextMenu(null)}
          onDelete={() => {
            setDeleteTarget(deleteContextMenu.item)
            setDeleteContextMenu(null)
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t('sidebar.knowledge.deleteTitle')}
          message={
            isDeletableSavedSharedKnowledgeBase(deleteTarget)
              ? t('sidebar.knowledge.sharedDeleteMessage', {
                  name: deleteTarget.name,
                })
              : t('sidebar.knowledge.deleteMessage', { name: deleteTarget.name })
          }
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDelete(deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      ) : null}
    </aside>
  )
}
