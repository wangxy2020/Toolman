import type { KnowledgeBase } from '@toolman/shared'
import {
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  resolveGroupSavedKnowledgeSidebarLabel,
  stripP2pGroupPrefixedResourceName,
} from '@toolman/shared'
import { IconChevronRight, IconCopy, IconFile, IconFolder, IconGlobe, IconPlus } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
  isDeletableKnowledgeBase,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'
import { KnowledgeSidebarMenuItem } from './KnowledgeSidebarMenuItem'

interface Props {
  items: KnowledgeBase[]
  sharedKnowledgeEntries?: SharedKnowledgeEntry[]
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
  sharedKnowledgeEntries = [],
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
  const localItems = items.filter(
    (item) => item.kind === 'local' && !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(item.name),
  )
  const networkItems = items.filter(
    (item) => item.kind === 'network' && !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(item.name),
  )
  const localFilesItems = items.filter(
    (item) => item.kind === 'local_files' && !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(item.name),
  )
  const savedSharedItems = items.filter(
    (item) =>
      item.kind === 'shared' &&
      !isP2pSharedKnowledgeMirrorDescription(item.description) &&
      item.documentCount > 0,
  )

  const liveSharedEntries = useMemo(() => {
    return sharedKnowledgeEntries.filter((entry) => {
      const sharedFolderName = stripP2pGroupPrefixedResourceName(
        entry.workspaceName,
        entry.resource.name,
      )
      const savedId = findGroupSavedKnowledgeBaseId(
        savedSharedItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          description: item.description ?? null,
        })),
        {
          p2pWorkspaceId: entry.p2pWorkspaceId,
          groupName: entry.workspaceName,
          sharedFolderName,
        },
        { isMirrorDescription: isP2pSharedKnowledgeMirrorDescription },
      )
      return savedId == null
    })
  }, [savedSharedItems, sharedKnowledgeEntries])
  const [expanded, setExpanded] = useState<Set<KnowledgeSidebarSection>>(
    () => new Set(['local', 'network', 'shared', 'local-files']),
  )
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null)

  useEffect(() => {
    if (!activeId) return
    setExpanded((prev) => {
      if (prev.has(activeSection)) return prev
      const next = new Set(prev)
      next.add(activeSection)
      return next
    })
  }, [activeId, activeSection])

  const toggleExpanded = (section: KnowledgeSidebarSection) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const handleSectionClick = (section: KnowledgeSidebarSection) => {
    onSelectSection(section)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(section)
      return next
    })
  }

  const suppressContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
  }

  const defaultFolderLabel = t('sidebar.knowledge.defaultFolder')

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

                {isOpen && section.id === 'local' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFolder size={14} />}
                      label={defaultFolderLabel}
                      active={
                        activeId === DEFAULT_KNOWLEDGE_FOLDER_ID && activeSection === 'local'
                      }
                      title={t('sidebar.knowledge.defaultFolderTitle')}
                      onClick={onSelectDefaultFolder}
                    />
                    {localItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFolder size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'local'}
                        title={t('sidebar.knowledge.itemMeta', {
                          name: item.name,
                          documents: item.documentCount,
                          chunks: item.chunkCount,
                        })}
                        onClick={() => onSelect(item.id)}
                        deletable={isDeletableKnowledgeBase(item.name)}
                        onRequestDelete={
                          isDeletableKnowledgeBase(item.name)
                            ? () => setDeleteTarget(item)
                            : undefined
                        }
                      />
                    ))}
                  </>
                ) : null}

                {isOpen && section.id === 'network' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFolder size={14} />}
                      label={defaultFolderLabel}
                      active={
                        activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID &&
                        activeSection === 'network'
                      }
                      title={t('sidebar.knowledge.networkDefaultTitle')}
                      onClick={onSelectDefaultNetworkFolder}
                    />
                    {networkItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconGlobe size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'network'}
                        title={t('sidebar.knowledge.itemMeta', {
                          name: item.name,
                          documents: item.documentCount,
                          chunks: item.chunkCount,
                        })}
                        onClick={() => onSelect(item.id)}
                        deletable={isDeletableKnowledgeBase(item.name)}
                        onRequestDelete={
                          isDeletableKnowledgeBase(item.name)
                            ? () => setDeleteTarget(item)
                            : undefined
                        }
                      />
                    ))}
                  </>
                ) : null}

                {isOpen && section.id === 'shared' ? (
                  <>
                    {loading && savedSharedItems.length === 0 && liveSharedEntries.length === 0 ? (
                      <div className="tm-session-empty">{t('common.loading')}</div>
                    ) : null}
                    {!loading &&
                    savedSharedItems.length === 0 &&
                    liveSharedEntries.length === 0 ? (
                      <div className="tm-session-empty">{t('sidebar.knowledge.noFolders')}</div>
                    ) : null}
                    {liveSharedEntries.map((entry) => {
                      const folderName = stripP2pGroupPrefixedResourceName(
                        entry.workspaceName,
                        entry.resource.name,
                      )
                      const label = `[${entry.workspaceName}] ${folderName}`
                      return (
                        <KnowledgeSidebarMenuItem
                          key={entry.id}
                          icon={<IconGlobe size={14} />}
                          label={label}
                          active={entry.id === activeId && activeSection === 'shared'}
                          title={`${label}（群组共享，保存到本地后可删除本地副本）`}
                          onClick={() => onSelect(entry.id)}
                        />
                      )
                    })}
                    {savedSharedItems.map((item) => {
                      const sharedLabel = resolveGroupSavedKnowledgeSidebarLabel(item)
                      return (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFolder size={14} />}
                        label={sharedLabel}
                        active={item.id === activeId && activeSection === 'shared'}
                        title={t('sidebar.knowledge.sharedItemMeta', {
                          name: sharedLabel,
                          documents: item.documentCount,
                        })}
                        onClick={() => onSelect(item.id)}
                        deletable
                        onRequestDelete={() => setDeleteTarget(item)}
                      />
                      )
                    })}
                  </>
                ) : null}

                {isOpen && section.id === 'local-files' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFolder size={14} />}
                      label={defaultFolderLabel}
                      active={
                        activeId === DEFAULT_LOCAL_FILES_FOLDER_ID &&
                        activeSection === 'local-files'
                      }
                      title={t('sidebar.knowledge.localFilesDefaultTitle')}
                      onClick={onSelectDefaultLocalFilesFolder}
                    />
                    {localFilesItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFile size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'local-files'}
                        title={t('sidebar.knowledge.fileMeta', {
                          name: item.name,
                          count: item.documentCount,
                        })}
                        onClick={() => onSelect(item.id)}
                        deletable={isDeletableKnowledgeBase(item.name)}
                        onRequestDelete={
                          isDeletableKnowledgeBase(item.name)
                            ? () => setDeleteTarget(item)
                            : undefined
                        }
                      />
                    ))}
                  </>
                ) : null}

                {isOpen && section.id === 'file-tools' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFile size={14} />}
                      label={t('sidebar.knowledge.fileRegistry')}
                      active={
                        activeId === FILE_REGISTRY_TOOL_ID && activeSection === 'file-tools'
                      }
                      title={t('sidebar.knowledge.fileRegistryTitle')}
                      onClick={onSelectFileRegistry}
                    />
                    <KnowledgeSidebarMenuItem
                      icon={<IconCopy size={14} />}
                      label={t('sidebar.knowledge.fileDedup')}
                      active={activeId === FILE_DEDUP_TOOL_ID && activeSection === 'file-tools'}
                      title={t('sidebar.knowledge.fileDedupTitle')}
                      onClick={onSelectFileDedup}
                    />
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {deleteTarget ? (
        <ConfirmDialog
          title={t('sidebar.knowledge.deleteTitle')}
          message={t('sidebar.knowledge.deleteMessage', { name: deleteTarget.name })}
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
