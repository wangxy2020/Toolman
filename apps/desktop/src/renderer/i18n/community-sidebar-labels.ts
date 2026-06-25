import type { CommunitySidebarSection } from '../features/community/community-sidebar-types'
import type { TranslateFn } from './I18nProvider'

export function getCommunitySidebarSectionLabel(
  section: CommunitySidebarSection,
  t: TranslateFn,
): string {
  return t(`sidebar.community.sections.${section}`)
}

export function communitySectionLabel(section: CommunitySidebarSection, t: TranslateFn): string {
  return getCommunitySidebarSectionLabel(section, t)
}
