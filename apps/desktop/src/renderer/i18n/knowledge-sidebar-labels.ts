import type { KnowledgeSidebarSection } from '../features/knowledge/knowledge-sidebar-types'
import type { TranslateFn } from './I18nProvider'

export function getKnowledgeSidebarSectionLabel(
  section: KnowledgeSidebarSection,
  t: TranslateFn,
): string {
  return t(`sidebar.knowledge.sections.${section}`)
}
