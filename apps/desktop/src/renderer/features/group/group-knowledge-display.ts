import type { KnowledgeBase, KnowledgeBaseKind, P2pSharedResource } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import {
  knowledgeSectionForKind,
  SYSTEM_DEFAULT_FOLDER_KB_NAMES,
} from '../knowledge/knowledge-sidebar-types'

const GROUP_KNOWLEDGE_KINDS = new Set<KnowledgeBaseKind>(['local', 'network', 'local_files'])

function sectionLabelForKind(kind: KnowledgeBaseKind, t: TranslateFn): string {
  return getKnowledgeSidebarSectionLabel(knowledgeSectionForKind(kind), t)
}

export function resolveGroupKnowledgeBaseLabel(
  kb: Pick<KnowledgeBase, 'name' | 'kind'>,
  t: TranslateFn,
): string {
  if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name) && GROUP_KNOWLEDGE_KINDS.has(kb.kind)) {
    const folderName = translateKnowledgeFolderName(kb.name, t)
    return `${sectionLabelForKind(kb.kind, t)} · ${folderName}`
  }
  return kb.name
}

export function resolveGroupKnowledgeResourceLabel(
  resource: Pick<P2pSharedResource, 'id' | 'name' | 'localResourceId' | 'sourceKbKind'>,
  knowledgeBases: KnowledgeBase[],
  t: TranslateFn,
): string {
  const kbId = resource.localResourceId ?? resource.id
  const localKb = knowledgeBases.find((item) => item.id === kbId)
  if (localKb) {
    return resolveGroupKnowledgeBaseLabel(localKb, t)
  }

  if (
    resource.sourceKbKind &&
    GROUP_KNOWLEDGE_KINDS.has(resource.sourceKbKind) &&
    SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(resource.name)
  ) {
    const folderName = translateKnowledgeFolderName(resource.name, t)
    return `${sectionLabelForKind(resource.sourceKbKind, t)} · ${folderName}`
  }

  return resource.name
}
