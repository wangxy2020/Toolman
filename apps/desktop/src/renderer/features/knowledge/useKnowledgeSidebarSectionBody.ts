import { useEffect, useMemo, useState } from 'react'

import {
  findGroupSavedKnowledgeBaseId,
  isP2pSharedKnowledgeMirrorDescription,
  stripP2pGroupPrefixedResourceName,
} from '@toolman/shared'
import type { KnowledgeBase } from '@toolman/shared'
import type { KnowledgeSidebarSection } from './knowledge-sidebar-types'
import { SYSTEM_DEFAULT_FOLDER_KB_NAMES } from './knowledge-sidebar-types'
import type { SharedKnowledgeEntry } from './useAllP2pSharedKnowledge'

export function useKnowledgeSidebarItems(
  items: KnowledgeBase[],
  sharedKnowledgeEntries: SharedKnowledgeEntry[],
) {
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

  return { localItems, networkItems, localFilesItems, savedSharedItems, liveSharedEntries }
}

export function useKnowledgeSidebarExpansion(activeId: string | null, activeSection: KnowledgeSidebarSection) {
  const [expanded, setExpanded] = useState<Set<KnowledgeSidebarSection>>(
    () => new Set(['local', 'network', 'shared', 'local-files']),
  )

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

  const expandSection = (section: KnowledgeSidebarSection) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(section)
      return next
    })
  }

  return { expanded, toggleExpanded, expandSection }
}
