import {
  resolveGroupSavedKnowledgeSidebarLabel,
  type KnowledgeBase,
} from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { groupAgentBindableKnowledgeBases } from '../knowledge/agent-knowledge-bind'
import { SYSTEM_DEFAULT_FOLDER_KB_NAMES } from '../knowledge/knowledge-sidebar-types'
import type { GroupPickerGroup, GroupPickerItem } from '../group/group-resource-picker-types'

export function resolveClassroomKbFolderLabel(kb: KnowledgeBase, t: TranslateFn): string {
  if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
    return translateKnowledgeFolderName(kb.name, t)
  }
  if (kb.kind === 'shared') {
    return resolveGroupSavedKnowledgeSidebarLabel(kb)
  }
  return kb.name
}

export function buildClassroomKbPickerGroups(options: {
  knowledgeBases: KnowledgeBase[]
  loadedDocs: Record<string, GroupPickerItem[]>
  docCountLabel: (count: number) => string
  sectionCountLabel: (count: number) => string
  t: TranslateFn
}): GroupPickerGroup[] {
  const { knowledgeBases, loadedDocs, docCountLabel, sectionCountLabel, t } = options
  const sectionGroups = groupAgentBindableKnowledgeBases(knowledgeBases)
  const result: GroupPickerGroup[] = []

  for (const section of sectionGroups) {
    if (section.items.length === 0) continue

    result.push({
      id: `section:${section.id}`,
      name: getKnowledgeSidebarSectionLabel(section.id, t),
      description: sectionCountLabel(section.items.length),
      items: [],
      sectionHeader: true,
      depth: 0,
    })

    for (const kb of section.items) {
      const loadedItems = loadedDocs[kb.id]
      const remainingCount = loadedItems != null ? loadedItems.length : kb.documentCount
      result.push({
        id: kb.id,
        name: resolveClassroomKbFolderLabel(kb, t),
        description: docCountLabel(remainingCount),
        groupSelectable: loadedItems == null && remainingCount > 0,
        selectableCount: remainingCount,
        items: loadedItems ?? [],
        depth: 1,
      })
    }
  }

  return result
}
