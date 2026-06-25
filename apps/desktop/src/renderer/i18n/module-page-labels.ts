import type { ModulePageConfig } from '../features/modules/module-config'
import type { ModuleView } from '../types/app-view'
import type { TranslateFn } from './I18nProvider'

export function resolveModulePageConfig(view: ModuleView, t: TranslateFn): ModulePageConfig {
  return {
    title: t(`modules.${view}.title`),
    addLabel: t(`modules.${view}.addLabel`),
    headerSegments: [t(`modules.${view}.headerAll`)],
    sidebarEmptyHint: t(`modules.${view}.sidebarEmptyHint`),
    contentEmptyTitle: t(`modules.${view}.contentEmptyTitle`),
    contentEmptyHint: t(`modules.${view}.contentEmptyHint`),
  }
}
