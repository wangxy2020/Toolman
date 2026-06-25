import { describe, expect, it, vi } from 'vitest'
import type { P2pSharedResourceRepository, P2pSharedResourceRow } from '@toolman/db'

import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'

describe('p2p-shared-resource-id', () => {
  it('finds shared resources in a workspace', () => {
    const row = { id: 'res-1' } as P2pSharedResourceRow
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => row),
    } as unknown as P2pSharedResourceRepository

    expect(
      findSharedResourceInWorkspace(repo, 'ws-1', 'kb-local', 'Knowledge'),
    ).toBe(row)
  })

  it('reuses preferred id when unused or same workspace', () => {
    const repo = {
      findById: vi.fn(() => null),
    } as unknown as P2pSharedResourceRepository
    expect(resolveSharedResourceId(repo, 'kb-local', 'ws-1')).toBe('kb-local')

    const sameWorkspace = {
      findById: vi.fn(() => ({ workspaceId: 'ws-1' })),
    } as unknown as P2pSharedResourceRepository
    expect(resolveSharedResourceId(sameWorkspace, 'kb-local', 'ws-1')).toBe('kb-local')
  })

  it('allocates a new id when preferred id belongs to another workspace', () => {
    const repo = {
      findById: vi.fn(() => ({ workspaceId: 'ws-other' })),
    } as unknown as P2pSharedResourceRepository
    const resolved = resolveSharedResourceId(repo, 'kb-local', 'ws-1')
    expect(resolved).not.toBe('kb-local')
    expect(resolved).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
