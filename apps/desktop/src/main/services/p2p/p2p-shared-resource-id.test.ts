import { describe, expect, it, vi } from 'vitest'
import type { P2pSharedResourceRepository, P2pSharedResourceRow } from '@toolman/db'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => null,
        }),
      }),
    }),
  })),
}))

import {
  findAgentSharedResourceInWorkspace,
  findSharedResourceForProjection,
  findSharedResourceInWorkspace,
  resolveAgentRelayResourceId,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'

describe('p2p-shared-resource-id', () => {
  it('findSharedResourceForProjection prefers workspace lookup', () => {
    const row = { id: 'res-1', workspaceId: 'ws-1', resourceType: 'Note' } as P2pSharedResourceRow
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => row),
      findById: vi.fn(),
    } as unknown as P2pSharedResourceRepository

    expect(findSharedResourceForProjection(repo, 'ws-1', 'note-1', 'Note')).toBe(row)
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('findSharedResourceForProjection falls back to id lookup in same workspace', () => {
    const row = { id: 'note-1', workspaceId: 'ws-1', resourceType: 'Note' } as P2pSharedResourceRow
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => null),
      findById: vi.fn(() => row),
    } as unknown as P2pSharedResourceRepository

    expect(findSharedResourceForProjection(repo, 'ws-1', 'note-1', 'Note')).toBe(row)
  })

  it('findSharedResourceForProjection returns null for mismatched workspace', () => {
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => null),
      findById: vi.fn(() => ({
        id: 'note-1',
        workspaceId: 'ws-other',
        resourceType: 'Note',
      })),
    } as unknown as P2pSharedResourceRepository

    expect(findSharedResourceForProjection(repo, 'ws-1', 'note-1', 'Note')).toBeNull()
  })

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

  it('resolveAgentRelayResourceId prefers explicit source assistant id', () => {
    const repo = {} as P2pSharedResourceRepository
    expect(resolveAgentRelayResourceId(repo, 'ws-1', 'agent-1', ' source-1 ')).toBe('source-1')
  })

  it('resolveAgentRelayResourceId falls back to shared resource ids', () => {
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => ({
        id: 'resource-1',
        localResourceId: 'agent-local',
        workspaceId: 'ws-1',
        resourceType: 'Agent',
      })),
      findById: vi.fn(),
    } as unknown as P2pSharedResourceRepository

    expect(resolveAgentRelayResourceId(repo, 'ws-1', 'resource-1')).toBe('agent-local')
  })

  it('resolveAgentRelayResourceId returns resource id when local id is missing', () => {
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => ({
        id: 'resource-1',
        localResourceId: '',
        workspaceId: 'ws-1',
        resourceType: 'Agent',
      })),
      findById: vi.fn(),
    } as unknown as P2pSharedResourceRepository

    expect(resolveAgentRelayResourceId(repo, 'ws-1', 'resource-1')).toBe('resource-1')
  })

  it('resolveAgentRelayResourceId returns input id when resource is missing', () => {
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => null),
      findById: vi.fn(() => null),
    } as unknown as P2pSharedResourceRepository

    expect(resolveAgentRelayResourceId(repo, 'ws-1', 'missing-agent')).toBe('missing-agent')
  })

  it('findAgentSharedResourceInWorkspace resolves relay id before lookup', () => {
    const row = { id: 'resource-1', localResourceId: 'agent-local' } as P2pSharedResourceRow
    const repo = {
      findByWorkspaceAndLocalResource: vi.fn(() => row),
      findById: vi.fn(),
    } as unknown as P2pSharedResourceRepository

    expect(findAgentSharedResourceInWorkspace(repo, 'ws-1', 'resource-1', 'agent-local')).toBe(row)
  })
})
