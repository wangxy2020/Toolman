import { describe, expect, it } from 'vitest'

import {
  canAccessAppView,
  guardAppView,
  isExtensionNavModule,
  navModuleIdForAppView,
} from './module-registry'
import { DEFAULT_VISIBLE_NAV_MODULES } from '../settings/nav-modules'

describe('module-registry', () => {
  it('maps app views to nav module ids', () => {
    expect(navModuleIdForAppView('projects')).toBe('projects')
    expect(navModuleIdForAppView('settings')).toBeNull()
  })

  it('treats projects as extension module', () => {
    expect(isExtensionNavModule('projects')).toBe(true)
  })

  it('blocks projects when not enabled in nav', () => {
    expect(canAccessAppView('projects', DEFAULT_VISIBLE_NAV_MODULES)).toBe(false)
    expect(guardAppView('projects', DEFAULT_VISIBLE_NAV_MODULES)).toBe('agent')
  })

  it('allows projects when enabled in nav', () => {
    const visible = [...DEFAULT_VISIBLE_NAV_MODULES, 'projects'] as const
    expect(canAccessAppView('projects', visible)).toBe(true)
    expect(guardAppView('projects', visible)).toBe('projects')
  })

  it('always allows agent and settings', () => {
    expect(canAccessAppView('agent', [])).toBe(true)
    expect(canAccessAppView('settings', [])).toBe(true)
  })

  it('blocks unavailable workflow view', () => {
    const visible = [...DEFAULT_VISIBLE_NAV_MODULES, 'workflow'] as const
    expect(canAccessAppView('workflow', visible)).toBe(false)
  })
})
