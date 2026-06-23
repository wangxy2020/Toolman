import { useEffect, useState } from 'react'
import type { KnowledgeBase } from '@toolman/shared'
import { isP2pSharedKnowledgeMirrorDescription } from '@toolman/shared'
import { IconChevronRight, IconCopy, IconFile, IconFolder, IconGlobe, IconPlus } from '../../components/icons'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { getModulePageConfig } from '../modules/module-config'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
  isDeletableKnowledgeBase,
  type KnowledgeSidebarSection,
} from './knowledge-sidebar-types'
import { KnowledgeSidebarMenuItem } from './KnowledgeSidebarMenuItem'

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
  const config = getModulePageConfig('knowledge')
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
      item.kind === 'shared' && !isP2pSharedKnowledgeMirrorDescription(item.description),
  )
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

  return (
    <aside className="tm-sidebar">
      <div className="tm-sidebar-content">
        <button type="button" className="tm-sidebar-add" onClick={onCreate}>
          <IconPlus />
          {config.addLabel}
        </button>

        <div className="tm-sidebar-list">
          {loading && localItems.length === 0 && activeSection === 'local' && (
            <div className="tm-empty">加载中…</div>
          )}

          {KNOWLEDGE_SIDEBAR_SECTIONS.map((section) => {
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
                    title={isOpen ? '收起' : '展开'}
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
                    {section.label}
                  </button>
                  <div className="tm-assistant-actions tm-assistant-actions--placeholder" aria-hidden="true" />
                </div>

                {isOpen && section.id === 'local' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFolder size={14} />}
                      label="默认文件夹"
                      active={
                        activeId === DEFAULT_KNOWLEDGE_FOLDER_ID && activeSection === 'local'
                      }
                      title="知识库文件的默认存储与导入位置"
                      onClick={onSelectDefaultFolder}
                    />
                    {localItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFolder size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'local'}
                        title={`${item.name} · ${item.documentCount} 文档 · ${item.chunkCount} 块`}
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
                      label={SYSTEM_DEFAULT_FOLDER_KB_NAME}
                      active={
                        activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID &&
                        activeSection === 'network'
                      }
                      title="网络知识库内容的默认保存位置"
                      onClick={onSelectDefaultNetworkFolder}
                    />
                    {networkItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconGlobe size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'network'}
                        title={`${item.name} · ${item.documentCount} 文档 · ${item.chunkCount} 块`}
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
                    {loading && savedSharedItems.length === 0 ? (
                      <div className="tm-session-empty">加载中…</div>
                    ) : null}
                    {!loading && savedSharedItems.length === 0 ? (
                      <div className="tm-session-empty">暂无已保存的共享文件夹</div>
                    ) : null}
                    {savedSharedItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFolder size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'shared'}
                        title={`${item.name} · ${item.documentCount} 文档 · 从群组保存到本地`}
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

                {isOpen && section.id === 'local-files' ? (
                  <>
                    <KnowledgeSidebarMenuItem
                      icon={<IconFolder size={14} />}
                      label={SYSTEM_DEFAULT_FOLDER_KB_NAME}
                      active={
                        activeId === DEFAULT_LOCAL_FILES_FOLDER_ID &&
                        activeSection === 'local-files'
                      }
                      title="本地文件的默认存储位置（不进行向量化）"
                      onClick={onSelectDefaultLocalFilesFolder}
                    />
                    {localFilesItems.map((item) => (
                      <KnowledgeSidebarMenuItem
                        key={item.id}
                        icon={<IconFile size={14} />}
                        label={item.name}
                        active={item.id === activeId && activeSection === 'local-files'}
                        title={`${item.name} · ${item.documentCount} 个文件`}
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
                      label="文件注册表"
                      active={
                        activeId === FILE_REGISTRY_TOOL_ID && activeSection === 'file-tools'
                      }
                      title="查看已索引文件的登记信息"
                      onClick={onSelectFileRegistry}
                    />
                    <KnowledgeSidebarMenuItem
                      icon={<IconCopy size={14} />}
                      label="文件查重"
                      active={activeId === FILE_DEDUP_TOOL_ID && activeSection === 'file-tools'}
                      title="扫描并识别重复文件"
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
          title="删除知识库"
          message={`确定删除「${deleteTarget.name}」？相关文档与索引将一并清理。`}
          confirmLabel="删除"
          cancelLabel="取消"
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
