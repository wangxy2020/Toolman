import { describe, expect, it } from 'vitest'

import {
  mergeHubAndFederatedResourceLists,
  resetFederatedCatalogCacheForTests,
} from './community-federated-catalog.service'

describe('community-federated-catalog.service', () => {
  it('merges hub and federated lists with hub winning on id collision', () => {
    resetFederatedCatalogCacheForTests()

    const hubItem = {
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Hub Title',
      description: 'from hub',
      author: { id: '00000000-0000-0000-0000-000000000001', displayName: 'Alice' },
      version: '1.0.0',
      tags: [],
      category: '',
      rating: 4,
      ratingCount: 1,
      downloadCount: 0,
      installCount: 3,
      favoriteCount: 0,
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      resourceType: 'mcp' as const,
      coverUrl: null,
      license: 'MIT',
      visibility: 'public' as const,
      status: 'published' as const,
      resourceSize: 100,
      createdAt: 1,
      updatedAt: 2,
    }

    const federatedItem = {
      ...hubItem,
      title: 'P2P Title',
      installCount: 0,
      federationSource: 'p2p' as const,
    }

    const merged = mergeHubAndFederatedResourceLists([hubItem], [federatedItem])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('Hub Title')
    expect(merged[0]?.federationSource).toBe('hub')
  })

  it('keeps federated-only resources when hub list is empty', () => {
    const federatedItem = {
      id: '00000000-0000-0000-0000-000000000020',
      title: 'Peer MCP',
      description: '',
      author: { id: '00000000-0000-0000-0000-000000000002', displayName: 'Bob' },
      version: '0.1.0',
      tags: [],
      category: '',
      rating: 0,
      ratingCount: 0,
      downloadCount: 0,
      installCount: 0,
      favoriteCount: 0,
      likeCount: 0,
      dislikeCount: 0,
      commentCount: 0,
      resourceType: 'skill' as const,
      coverUrl: null,
      license: '',
      visibility: 'public' as const,
      status: 'published' as const,
      resourceSize: 50,
      createdAt: 10,
      updatedAt: 20,
      federationSource: 'p2p' as const,
    }

    const merged = mergeHubAndFederatedResourceLists([], [federatedItem])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.federationSource).toBe('p2p')
  })
})
