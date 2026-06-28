import { readFile } from 'node:fs/promises'

import {
  CommunityInstallCompleteInputSchema,
  CommunityInstallCompleteOutputSchema,
  CommunityInstallHistoryInputSchema,
  CommunityInstallHistoryOutputSchema,
  CommunityInstallInputSchema,
  CommunityInstallOutputSchema,
  CommunityInstallRollbackInputSchema,
  CommunityResourceCreateInputSchema,
  CommunityResourceDeleteInputSchema,
  CommunityResourceDeleteOutputSchema,
  CommunityResourceDetailSchema,
  CommunityResourceInteractionInputSchema,
  CommunityResourceInteractionOutputSchema,
  CommunityResourceGetInputSchema,
  CommunityResourceItemSchema,
  CommunityResourceListInputSchema,
  CommunityResourceListOutputSchema,
  CommunityResourcePatchInputSchema,
  CommunityResourcePublishInputSchema,
  CommunityReviewCreateInputSchema,
  CommunityReviewDeleteInputSchema,
  CommunityReviewDeleteOutputSchema,
  CommunityReviewItemSchema,
  CommunityReviewListInputSchema,
  CommunityReviewListOutputSchema,
  CommunityReviewPatchInputSchema,
} from '@toolman/shared'

import { buildApiQuery, fromApiJson, toApiJson } from './community-case'
import {
  marketplacePublishSegment,
  resolveCommunityPackageFilename,
} from './community-resource-type.config'
import {
  buildFederatedCatalogEntryFromResource,
  hasFederatedCatalogEntry,
  listFederatedCatalogResources,
  mergeHubAndFederatedResourceLists,
  removeFederatedCatalogEntry,
} from './community-federated-catalog.service'
import { CommunityHttpError } from './community-http.client'
import { isCommunityFederationEnabled } from './community-federation.config'
import { publishFederatedCatalogDeleteWireMessage, publishFederatedCatalogWireMessage } from './community-federation-provider.service'
import { getManifestFromIndexByResource, scanCommunityPackagesForCidIndex } from './community-cid-index.service'
import { republishCommunityCidAnnouncements } from './community-cid-provider.service'
import { CommunityHttpError } from './community-http.client'
import { invalidateCommunityHubCache } from './community-hub-cache.service'
import {
  asItems,
  fetchWithHubCache,
  requireClient,
  withRefreshedHubClient,
} from './community-ipc.facade-core'

export async function listResources(input: unknown) {
  const parsed = CommunityResourceListInputSchema.parse(input)
  const query = buildApiQuery({
    resource_type: parsed.resourceType,
    category: parsed.category,
    tags: parsed.tags,
    q: parsed.q,
    sort: parsed.sort,
    visibility: parsed.visibility,
    status: parsed.status,
    author_id: parsed.authorId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const cacheKey = `marketplace-resources${query}`

  let hubItems: ReturnType<typeof CommunityResourceItemSchema.parse>[] = []
  try {
    const data = await fetchWithHubCache(cacheKey, (client) =>
      client.get<unknown[]>(`/api/v1/marketplace/resources${query}`),
    )
    hubItems = asItems(data).map((item) => CommunityResourceItemSchema.parse(fromApiJson(item)))
  } catch (error) {
    if (!isCommunityFederationEnabled()) {
      throw error
    }
  }

  if (parsed.authorId || !isCommunityFederationEnabled()) {
    return CommunityResourceListOutputSchema.parse({ items: hubItems })
  }

  const federatedItems = listFederatedCatalogResources(parsed)
  const items = mergeHubAndFederatedResourceLists(hubItems, federatedItems)
  return CommunityResourceListOutputSchema.parse({ items })
}

export async function getResource(input: unknown) {
  const parsed = CommunityResourceGetInputSchema.parse(input)
  return withRefreshedHubClient(async (client) => {
    const data = await client.get<unknown>(`/api/v1/marketplace/resources/${parsed.id}`)
    return CommunityResourceDetailSchema.parse(fromApiJson(data))
  })
}

export async function createResource(input: unknown) {
  const parsed = CommunityResourceCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/marketplace/resources', toApiJson(parsed))
  invalidateCommunityHubCache('marketplace-resources')
  return CommunityResourceItemSchema.parse(fromApiJson(data))
}

export async function publishResource(input: unknown) {
  const parsed = CommunityResourcePublishInputSchema.parse(input)

  return withRefreshedHubClient(async (client) => {
    let resourceType = parsed.resourceType
    if (!resourceType) {
      const resourceDetail = await client.get<Record<string, unknown>>(
        `/api/v1/marketplace/resources/${parsed.id}`,
      )
      const resolvedType = String(
        resourceDetail.resource_type ?? resourceDetail.resourceType ?? '',
      )
      if (resolvedType) {
        resourceType = resolvedType as NonNullable<typeof parsed.resourceType>
      }
    }
    if (!resourceType) {
      throw new CommunityHttpError('无法识别资源类型', 400, 'VALIDATION_ERROR')
    }
    const segment = marketplacePublishSegment(resourceType)
    let packagePath = parsed.packagePath
    const prepareTitle = parsed.originalFilename
    if (resourceType === 'mcp') {
      const { prepareCommunityMcpPackage: preparePackage } = await import(
        './community-mcp-package-import.service'
      )
      const prepared = await preparePackage({
        packagePath: parsed.packagePath,
        title: prepareTitle,
      })
      packagePath = prepared.packagePath
    } else if (resourceType === 'skill') {
      const { prepareCommunitySkillPackage: preparePackage } = await import(
        './community-skill-package-import.service'
      )
      const prepared = await preparePackage({
        packagePath: parsed.packagePath,
        title: prepareTitle,
      })
      packagePath = prepared.packagePath
    } else if (resourceType === 'workflow') {
      const { prepareCommunityWorkflowPackage: preparePackage } = await import(
        './community-workflow-package-import.service'
      )
      const prepared = await preparePackage({
        packagePath: parsed.packagePath,
        title: prepareTitle,
      })
      packagePath = prepared.packagePath
    } else if (resourceType === 'knowledge') {
      const { prepareCommunityKnowledgePackage: preparePackage } = await import(
        './community-knowledge-package-import.service'
      )
      const prepared = await preparePackage({
        packagePath: parsed.packagePath,
        title: prepareTitle,
      })
      packagePath = prepared.packagePath
    }
    const packageBytes = await readFile(packagePath)
    const uploadName =
      parsed.originalFilename ??
      resolveCommunityPackageFilename(resourceType, packagePath)
    const data = await client.postMultipart<unknown>(
      `/api/v1/marketplace/${segment}/${parsed.id}/publish`,
      [
        { name: 'version', value: parsed.version },
        ...(parsed.changelog ? [{ name: 'changelog', value: parsed.changelog }] : []),
        {
          name: 'package',
          value: packageBytes,
          filename: uploadName,
        },
      ],
    )
    const published = fromApiJson(data) as Record<string, unknown>
    const item = CommunityResourceItemSchema.parse({
      ...published,
      resourceType,
    })

    if (isCommunityFederationEnabled() && item.status === 'published') {
      await scanCommunityPackagesForCidIndex()
      const manifest = getManifestFromIndexByResource(item.id, item.version)
      if (manifest) {
        const entry = buildFederatedCatalogEntryFromResource(item, manifest.rootCid)
        publishFederatedCatalogWireMessage(entry)
      }
      await republishCommunityCidAnnouncements()
    }

    invalidateCommunityHubCache('marketplace-resources')
    return item
  })
}

export async function patchResource(input: unknown) {
  const parsed = CommunityResourcePatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(
    `/api/v1/marketplace/resources/${id}`,
    toApiJson(patch as Record<string, unknown>),
  )
  return CommunityResourceItemSchema.parse(fromApiJson(data))
}

export async function deleteResource(input: unknown) {
  const parsed = CommunityResourceDeleteInputSchema.parse(input)
  const inFederatedCatalog = hasFederatedCatalogEntry(parsed.id)

  try {
    await withRefreshedHubClient((client) =>
      client.delete<unknown>(`/api/v1/marketplace/resources/${parsed.id}`),
    )
  } catch (error) {
    const hubMissing =
      error instanceof CommunityHttpError && error.status === 404
    if (!hubMissing || !inFederatedCatalog) {
      throw error
    }
  }

  removeFederatedCatalogEntry(parsed.id)
  if (isCommunityFederationEnabled()) {
    publishFederatedCatalogDeleteWireMessage(parsed.id)
  }
  invalidateCommunityHubCache('marketplace-resources')
  return CommunityResourceDeleteOutputSchema.parse({ deleted: true })
}

export async function likeResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/like`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function dislikeResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/dislike`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function favoriteResource(input: unknown) {
  const parsed = CommunityResourceInteractionInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/marketplace/resources/${parsed.resourceId}/favorite`,
  )
  return CommunityResourceInteractionOutputSchema.parse(fromApiJson(data))
}

export async function startInstall(input: unknown) {
  const parsed = CommunityInstallInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.resourceType}/${parsed.resourceId}`,
    toApiJson({
      version: parsed.version,
      workspaceId: parsed.workspaceId,
      options: parsed.options,
    }),
  )
  return CommunityInstallOutputSchema.parse(fromApiJson(data))
}

export async function completeInstall(input: unknown) {
  const parsed = CommunityInstallCompleteInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(
    `/api/v1/install/${parsed.installId}/complete`,
    toApiJson({
      status: parsed.status,
      localRef: parsed.localRef,
      errorMessage: parsed.errorMessage,
    }),
  )
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function rollbackInstall(input: unknown) {
  const parsed = CommunityInstallRollbackInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>(`/api/v1/install/${parsed.installId}/rollback`)
  return CommunityInstallCompleteOutputSchema.parse(fromApiJson(data))
}

export async function listInstallHistory(input: unknown) {
  const parsed = CommunityInstallHistoryInputSchema.parse(input ?? {})
  const client = requireClient()
  const query = buildApiQuery({
    resource_type: parsed.resourceType,
    workspace_id: parsed.workspaceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/install/history${query}`)
  return CommunityInstallHistoryOutputSchema.parse({ items: asItems(data) })
}

export async function createReview(input: unknown) {
  const parsed = CommunityReviewCreateInputSchema.parse(input)
  const client = requireClient()
  const data = await client.post<unknown>('/api/v1/reviews', toApiJson(parsed))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function listReviews(input: unknown) {
  const parsed = CommunityReviewListInputSchema.parse(input)
  const client = requireClient()
  const query = buildApiQuery({
    resource_id: parsed.resourceId,
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const data = await client.get<unknown[]>(`/api/v1/reviews${query}`)
  return CommunityReviewListOutputSchema.parse({
    items: asItems(data).map((item) => CommunityReviewItemSchema.parse(item)),
  })
}

export async function patchReview(input: unknown) {
  const parsed = CommunityReviewPatchInputSchema.parse(input)
  const { id, ...patch } = parsed
  const client = requireClient()
  const data = await client.patch<unknown>(`/api/v1/reviews/${id}`, toApiJson(patch as Record<string, unknown>))
  return CommunityReviewItemSchema.parse(fromApiJson(data))
}

export async function deleteReview(input: unknown) {
  const parsed = CommunityReviewDeleteInputSchema.parse(input)
  const client = requireClient()
  await client.delete<unknown>(`/api/v1/reviews/${parsed.id}`)
  return CommunityReviewDeleteOutputSchema.parse({ deleted: true })
}
