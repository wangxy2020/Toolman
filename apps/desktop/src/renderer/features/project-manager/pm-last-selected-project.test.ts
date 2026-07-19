import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  readLastSelectedProjectId,
  resolveDefaultProjectId,
  writeLastSelectedProjectId,
} from './pm-last-selected-project'

describe('pm-last-selected-project', () => {
  const workspaceId = 'ws-test'
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    })
  })

  afterEach(() => {
    store.clear()
  })

  it('reads and writes last selected project id', () => {
    expect(readLastSelectedProjectId(workspaceId)).toBeNull()
    writeLastSelectedProjectId(workspaceId, 'proj-2')
    expect(readLastSelectedProjectId(workspaceId)).toBe('proj-2')
  })

  it('resolves last used project when it still exists', () => {
    writeLastSelectedProjectId(workspaceId, 'proj-2')
    expect(
      resolveDefaultProjectId(workspaceId, [{ id: 'proj-1' }, { id: 'proj-2' }]),
    ).toBe('proj-2')
  })

  it('falls back to first project when last used is missing', () => {
    writeLastSelectedProjectId(workspaceId, 'proj-gone')
    expect(resolveDefaultProjectId(workspaceId, [{ id: 'proj-1' }, { id: 'proj-2' }])).toBe(
      'proj-1',
    )
  })

  it('returns null for an empty project list', () => {
    writeLastSelectedProjectId(workspaceId, 'proj-1')
    expect(resolveDefaultProjectId(workspaceId, [])).toBeNull()
  })
})
