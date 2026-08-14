import { describe, expect, it } from 'vitest'
import { hideNavModule, normalizeNavModules, showNavModule } from './nav-visibility'

describe('normalizeNavModules', () => {
  it('keeps agent visible and restores default order', () => {
    expect(normalizeNavModules(['notes', 'agent'], ['knowledge']).visibleModuleIds).toEqual([
      'agent',
      'notes',
    ])
    expect(normalizeNavModules().visibleModuleIds[0]).toBe('agent')
  })

  it('cannot hide the agent module', () => {
    const next = hideNavModule(normalizeNavModules(), 'agent')
    expect(next.visibleModuleIds).toContain('agent')
    expect(next.hiddenModuleIds).not.toContain('agent')
  })

  it('moves closable modules between lists', () => {
    const hidden = hideNavModule(normalizeNavModules(), 'projects')
    expect(hidden.hiddenModuleIds).toContain('projects')
    expect(showNavModule(hidden, 'projects').visibleModuleIds).toContain('projects')
  })
})
