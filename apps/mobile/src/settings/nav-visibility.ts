import { TOP_NAV_MODULE_IDS, type TopNavModuleId } from '../module-ids'

export const LOCKED_TOP_MODULE: TopNavModuleId = 'agent'

export type NavModulePrefs = {
  visibleModuleIds: TopNavModuleId[]
  hiddenModuleIds: TopNavModuleId[]
}

export function isTopNavModuleId(id: string): id is TopNavModuleId {
  return (TOP_NAV_MODULE_IDS as readonly string[]).includes(id)
}

export function normalizeNavModules(
  visible?: readonly string[],
  hidden?: readonly string[],
): NavModulePrefs {
  const all = [...TOP_NAV_MODULE_IDS]
  const visibleSet = new Set(
    (visible ?? all).filter((id): id is TopNavModuleId => isTopNavModuleId(id)),
  )
  visibleSet.add(LOCKED_TOP_MODULE)
  if (hidden) {
    for (const id of hidden) {
      if (isTopNavModuleId(id) && id !== LOCKED_TOP_MODULE) visibleSet.delete(id)
    }
  }
  return {
    visibleModuleIds: all.filter((id) => visibleSet.has(id)),
    hiddenModuleIds: all.filter((id) => !visibleSet.has(id)),
  }
}

export function hideNavModule(nav: NavModulePrefs, id: TopNavModuleId): NavModulePrefs {
  if (id === LOCKED_TOP_MODULE) return nav
  return normalizeNavModules(
    nav.visibleModuleIds.filter((item) => item !== id),
    [...nav.hiddenModuleIds, id],
  )
}

export function showNavModule(nav: NavModulePrefs, id: TopNavModuleId): NavModulePrefs {
  return normalizeNavModules([...nav.visibleModuleIds, id], nav.hiddenModuleIds.filter((item) => item !== id))
}
