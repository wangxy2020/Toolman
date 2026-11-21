import type { ReactNode } from 'react'
import type { KnowledgeBase } from '@toolman/shared'
import {
  resolveGroupSavedKnowledgeSidebarLabel,
} from '@toolman/shared'

import { IconCopy, IconFile, IconFolder, IconGlobe } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { KnowledgeSidebarMenuItem } from './KnowledgeSidebarMenuItem'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  isDeletableKnowledgeBase,
  isDeletableSavedSharedKnowledgeBase,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'

interface SectionBodyProps {
  section: KnowledgeSidebarSection
  loading?: boolean
  activeId: string | null
  activeSection: KnowledgeSidebarSection
  localItems: KnowledgeBase[]
  syncItems: KnowledgeBase[]
  networkItems: KnowledgeBase[]
  localFilesItems: KnowledgeBase[]
  savedSharedItems: KnowledgeBase[]
  defaultFolderLabel: string
  renameKbId: string | null
  onSelect: (id: string) => void
  onSelectDefaultFolder: () => void
  onSelectDefaultSyncFolder: () => void
  onSelectDefaultNetworkFolder: () => void
  onSelectDefaultLocalFilesFolder: () => void
  onSelectFileRegistry: () => void
  onSelectFileDedup: () => void
  onRequestContextMenu: (item: KnowledgeBase, event: React.MouseEvent) => void
  onStartRename: (kbId: string) => void
  onCancelRename: () => void
  onRename: (kbId: string, name: string) => void
}

function canManageKnowledgeBase(item: KnowledgeBase): boolean {
  if (item.kind === 'shared') return isDeletableSavedSharedKnowledgeBase(item)
  return isDeletableKnowledgeBase(item.name)
}

export function KnowledgeSidebarSectionBody({
  section,
  loading,
  activeId,
  activeSection,
  localItems,
  syncItems,
  networkItems,
  localFilesItems,
  savedSharedItems,
  defaultFolderLabel,
  renameKbId,
  onSelect,
  onSelectDefaultFolder,
  onSelectDefaultSyncFolder,
  onSelectDefaultNetworkFolder,
  onSelectDefaultLocalFilesFolder,
  onSelectFileRegistry,
  onSelectFileDedup,
  onRequestContextMenu,
  onStartRename,
  onCancelRename,
  onRename,
}: SectionBodyProps) {
  const { t } = useI18n()

  const renderManagedItem = (
    item: KnowledgeBase,
    options: {
      icon: ReactNode
      label: string
      title: string
      sectionId: KnowledgeSidebarSection
    },
  ) => {
    const canManage = canManageKnowledgeBase(item)
    return (
      <KnowledgeSidebarMenuItem
        key={item.id}
        icon={options.icon}
        label={options.label}
        active={item.id === activeId && activeSection === options.sectionId}
        title={options.title}
        isRenaming={renameKbId === item.id}
        onClick={() => onSelect(item.id)}
        onContextMenu={canManage ? (event) => onRequestContextMenu(item, event) : undefined}
        onStartRename={canManage ? () => onStartRename(item.id) : undefined}
        onCancelRename={onCancelRename}
        onRename={(next) => onRename(item.id, next)}
      />
    )
  }

  if (section === 'local') {
    return (
      <>
        <KnowledgeSidebarMenuItem
          icon={<IconFolder size={14} />}
          label={defaultFolderLabel}
          active={activeId === DEFAULT_KNOWLEDGE_FOLDER_ID && activeSection === 'local'}
          title={t('sidebar.knowledge.defaultFolderTitle')}
          onClick={onSelectDefaultFolder}
        />
        {localItems.map((item) =>
          renderManagedItem(item, {
            icon: <IconFolder size={14} />,
            label: item.name,
            title: t('sidebar.knowledge.itemMeta', {
              name: item.name,
              documents: item.documentCount,
              chunks: item.chunkCount,
            }),
            sectionId: 'local',
          }),
        )}
      </>
    )
  }

  if (section === 'sync') {
    return (
      <>
        <KnowledgeSidebarMenuItem
          icon={<IconFolder size={14} />}
          label={defaultFolderLabel}
          active={activeId === DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID && activeSection === 'sync'}
          title={t('sidebar.knowledge.syncDefaultTitle')}
          onClick={onSelectDefaultSyncFolder}
        />
        {syncItems.map((item) =>
          renderManagedItem(item, {
            icon: <IconFolder size={14} />,
            label: item.name,
            title: t('sidebar.knowledge.itemMeta', {
              name: item.name,
              documents: item.documentCount,
              chunks: item.chunkCount,
            }),
            sectionId: 'sync',
          }),
        )}
      </>
    )
  }

  if (section === 'network') {
    return (
      <>
        <KnowledgeSidebarMenuItem
          icon={<IconFolder size={14} />}
          label={defaultFolderLabel}
          active={activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID && activeSection === 'network'}
          title={t('sidebar.knowledge.networkDefaultTitle')}
          onClick={onSelectDefaultNetworkFolder}
        />
        {networkItems.map((item) =>
          renderManagedItem(item, {
            icon: <IconGlobe size={14} />,
            label: item.name,
            title: t('sidebar.knowledge.itemMeta', {
              name: item.name,
              documents: item.documentCount,
              chunks: item.chunkCount,
            }),
            sectionId: 'network',
          }),
        )}
      </>
    )
  }

  if (section === 'shared') {
    return (
      <>
        {loading && savedSharedItems.length === 0 ? (
          <div className="tm-session-empty">{t('common.loading')}</div>
        ) : null}
        {!loading && savedSharedItems.length === 0 ? (
          <div className="tm-session-empty">{t('sidebar.knowledge.noFolders')}</div>
        ) : null}
        {savedSharedItems.map((item) => {
          const sharedLabel = resolveGroupSavedKnowledgeSidebarLabel(item)
          return renderManagedItem(item, {
            icon: <IconFolder size={14} />,
            label: sharedLabel,
            title: t('sidebar.knowledge.sharedItemMeta', {
              name: sharedLabel,
              documents: item.documentCount,
            }),
            sectionId: 'shared',
          })
        })}
      </>
    )
  }

  if (section === 'local-files') {
    return (
      <>
        <KnowledgeSidebarMenuItem
          icon={<IconFolder size={14} />}
          label={defaultFolderLabel}
          active={activeId === DEFAULT_LOCAL_FILES_FOLDER_ID && activeSection === 'local-files'}
          title={t('sidebar.knowledge.localFilesDefaultTitle')}
          onClick={onSelectDefaultLocalFilesFolder}
        />
        {localFilesItems.map((item) =>
          renderManagedItem(item, {
            icon: <IconFile size={14} />,
            label: item.name,
            title: t('sidebar.knowledge.fileMeta', {
              name: item.name,
              count: item.documentCount,
            }),
            sectionId: 'local-files',
          }),
        )}
      </>
    )
  }

  if (section === 'file-tools') {
    return (
      <>
        <KnowledgeSidebarMenuItem
          icon={<IconFile size={14} />}
          label={t('sidebar.knowledge.fileRegistry')}
          active={activeId === FILE_REGISTRY_TOOL_ID && activeSection === 'file-tools'}
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
    )
  }

  return null
}

export { useKnowledgeSidebarExpansion, useKnowledgeSidebarItems } from './useKnowledgeSidebarSectionBody'
