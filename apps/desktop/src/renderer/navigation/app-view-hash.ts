import type { AppView } from '../types/app-view'

const VIEW_TO_HASH: Partial<Record<AppView, string>> = {
  projects: '#/project-manager',
}

const HASH_TO_VIEW: Record<string, AppView> = {
  '/project-manager': 'projects',
}

export function appViewFromLocationHash(hash: string): AppView | null {
  const normalized = hash.replace(/^#/, '').split('?')[0]?.trim() ?? ''
  if (!normalized) return null
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`
  return HASH_TO_VIEW[path] ?? null
}

export function locationHashForAppView(view: AppView): string | null {
  return VIEW_TO_HASH[view] ?? null
}

export function syncLocationHashForAppView(view: AppView): void {
  const nextHash = locationHashForAppView(view)
  if (nextHash) {
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    }
    return
  }
  if (window.location.hash.startsWith('#/project-manager')) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }
}
