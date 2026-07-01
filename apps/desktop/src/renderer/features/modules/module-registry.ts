import type { AppView } from '../../types/app-view'
import type { ModuleTier, NavModuleId } from '../settings/nav-modules'
import {
  getNavModuleDef,
  LOCKED_NAV_MODULE,
  MENU_HIDDEN_POOL,
  MENU_VISIBLE_POOL,
  NAV_MODULE_DEFS,
} from '../settings/nav-modules'

export type { ModuleTier } from '../settings/nav-modules'

/** 安装态：builtin=随应用内置；unavailable=尚未就绪 */
export type ModuleInstallState = 'builtin' | 'unavailable'

export const CORE_NAV_MODULE_IDS: NavModuleId[] = [...MENU_VISIBLE_POOL]

export const EXTENSION_NAV_MODULE_IDS: NavModuleId[] = [...MENU_HIDDEN_POOL]

export function getModuleTier(moduleId: NavModuleId): ModuleTier {
  return getNavModuleDef(moduleId).tier
}

export function isCoreNavModule(moduleId: NavModuleId): boolean {
  return getModuleTier(moduleId) === 'core'
}

export function isExtensionNavModule(moduleId: NavModuleId): boolean {
  return getModuleTier(moduleId) === 'extension'
}

export function getModuleInstallState(moduleId: NavModuleId): ModuleInstallState {
  return getNavModuleDef(moduleId).available ? 'builtin' : 'unavailable'
}

export function navModuleIdForAppView(view: AppView): NavModuleId | null {
  if (view === 'settings') return null
  for (const def of Object.values(NAV_MODULE_DEFS)) {
    if (def.view === view) return def.id
  }
  return null
}

export function isModuleEnabledInNav(
  moduleId: NavModuleId,
  visibleModules: readonly NavModuleId[],
): boolean {
  return visibleModules.includes(moduleId)
}

/** 模块是否允许进入（已就绪 + 已在导航中启用；智能体/设置始终允许） */
export function canAccessAppView(
  view: AppView,
  visibleModules: readonly NavModuleId[],
): boolean {
  if (view === 'settings' || view === 'agent') {
    return true
  }

  const moduleId = navModuleIdForAppView(view)
  if (!moduleId) {
    return false
  }

  const def = getNavModuleDef(moduleId)
  if (!def.available || !def.view) {
    return false
  }

  return isModuleEnabledInNav(moduleId, visibleModules)
}

/** 不可访问时回退到智能体 */
export function guardAppView(view: AppView, visibleModules: readonly NavModuleId[]): AppView {
  return canAccessAppView(view, visibleModules) ? view : 'agent'
}

export function isLockedNavModule(moduleId: NavModuleId): boolean {
  return moduleId === LOCKED_NAV_MODULE
}
