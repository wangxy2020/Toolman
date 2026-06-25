import type { NavModuleId } from '../features/settings/nav-modules'
import type { TranslateFn } from './I18nProvider'

export function getNavModuleLabel(id: NavModuleId, t: TranslateFn): string {
  return t(`nav.modules.${id}`)
}
