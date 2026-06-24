import { useEffect } from 'react'

import {
  CommunityResourceItemSchema,
  FederatedCatalogUpdateEventSchema,
  type CommunityResourceItem,
} from '@toolman/shared'

function toResourceItem(entry: NonNullable<ReturnType<typeof FederatedCatalogUpdateEventSchema.parse>['entry']>): CommunityResourceItem {
  return CommunityResourceItemSchema.parse({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    author: entry.author,
    version: entry.version,
    tags: entry.tags,
    category: entry.category,
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    installCount: 0,
    favoriteCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    commentCount: 0,
    resourceType: entry.resourceType,
    coverUrl: null,
    license: entry.license,
    visibility: 'public',
    status: 'published',
    resourceSize: entry.resourceSize,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    federationSource: 'p2p',
  })
}

export function useCommunityFederatedCatalogUpdates(
  resourceType: CommunityResourceItem['resourceType'] | undefined,
  onUpsert: (item: CommunityResourceItem) => void,
): void {
  useEffect(() => {
    const unsubscribe = window.api.subscribe('community:federated:catalog:update', (payload) => {
      const parsed = FederatedCatalogUpdateEventSchema.safeParse(payload)
      if (!parsed.success || parsed.data.action !== 'upsert' || !parsed.data.entry) return
      if (resourceType && parsed.data.entry.resourceType !== resourceType) return
      onUpsert(toResourceItem(parsed.data.entry))
    })
    return unsubscribe
  }, [onUpsert, resourceType])
}
