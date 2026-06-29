import type { KnowledgeBase } from '@toolman/shared'
import {
  resolveGroupSavedKnowledgeSidebarLabel,
  stripP2pGroupPrefixedResourceName,
} from '@toolman/shared'

import { IconCopy, IconFile, IconFolder, IconGlobe } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { KnowledgeSidebarMenuItem } from './KnowledgeSidebarMenuItem'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  isDeletableKnowledgeBase,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'

interface SectionBodyProps {
  section: KnowledgeSidebarSection
  loading?: boolean
  activeId: string | null
  activeSection: KnowledgeSidebarSection
  localItems: KnowledgeBase[]
  networkItems: KnowledgeBase[]
  localFilesItems: KnowledgeBase[]
  savedSharedItems: KnowledgeBase[]
  liveSharedEntries: SharedKnowledgeEntry[]
  defaultFolderLabel: string
  onSelect: (id: string) => void
  onSelectDefaultFolder: () => void
  onSelectDefaultNetworkFolder: () => void
  onSelectDefaultLocalFilesFolder: () => void
  onSelectFileRegistry: () => void
  onSelectFileDedup: () => void
  onRequestDelete: (item: KnowledgeBase) => void
}

export function KnowledgeSidebarSectionBody({
  section,
  loading,
  activeId,
  activeSection,
  localItems,
  networkItems,
  localFilesItems,
  savedSharedItems,
  liveSharedEntries,
  defaultFolderLabel,
  onSelect,
  onSelectDefaultFolder,
  onSelectDefaultNetworkFolder,
  onSelectDefaultLocalFilesFolder,
  onSelectFileRegistry,
  onSelectFileDedup,
  onRequestDelete,
}: SectionBodyProps) {
  const { t } = useI18n()

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
              isDeletableKnowledgeBase(item.name) ? () => onRequestDelete(item) : undefined
            }
          />
        ))}
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
              isDeletableKnowledgeBase(item.name) ? () => onRequestDelete(item) : undefined
            }
          />
        ))}
      </>
    )
  }

  if (section === 'shared') {
    return (
      <>
        {loading && savedSharedItems.length === 0 && liveSharedEntries.length === 0 ? (
          <div className="tm-session-empty">{t('common.loading')}</div>
        ) : null}
        {!loading && savedSharedItems.length === 0 && liveSharedEntries.length === 0 ? (
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
              onRequestDelete={() => onRequestDelete(item)}
            />
          )
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
              isDeletableKnowledgeBase(item.name) ? () => onRequestDelete(item) : undefined
            }
          />
        ))}
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
