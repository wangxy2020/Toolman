import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type {
  CommunityInstallInput,
  CommunityResourceDetail,
  CommunityResourceItem,
  CommunityResourceListInput,
  CommunityResourceType,
} from '@toolman/shared'

import {
  getCommunityResource,
  installCommunityResource,
  listCommunityResources,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { formatCommunityHubError, isCommunityHubRateLimitError } from './community-hub-error-utils'
import {
  fetchCommunityListCached,
  readCommunityListCache,
} from './community-list-cache'
import {
  COMMUNITY_UI_MOCK_ENABLED,
  getUiMockResource,
  withUiMockItem,
} from './community-ui-mock'
import { applyUiMockInteractionToResource } from './community-ui-mock-interactions'

export function useCommunityResourceLoader(
  listInput: CommunityResourceListInput,
  cacheKey: string,
  resourceType: CommunityResourceType | undefined,
  autoLoadDetail: boolean,
  setItems: Dispatch<SetStateAction<CommunityResourceItem[]>>,
  setDetail: Dispatch<SetStateAction<CommunityResourceDetail | null>>,
  setSelectedId: Dispatch<SetStateAction<string | null>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setDetailLoading: Dispatch<SetStateAction<boolean>>,
  setInstallingId: Dispatch<SetStateAction<string | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const load = useCallback(async (options?: { force?: boolean; background?: boolean }) => {
    const background = options?.background === true
    const cached = !options?.force
      ? readCommunityListCache<Awaited<ReturnType<typeof listCommunityResources>>>(cacheKey)
      : null
    if (!background && !cached?.items.length) {
      setLoading(true)
    }
    setError(null)
    try {
      const list = options?.force
        ? await listCommunityResources(listInput)
        : await fetchCommunityListCached(
            cacheKey,
            () => listCommunityResources(listInput),
            { force: options?.force },
          )
      const mockType = resourceType ?? 'mcp'
      setItems(
        withUiMockItem(list.items, getUiMockResource(mockType)).map(applyUiMockInteractionToResource),
      )
      if (autoLoadDetail) {
        setSelectedId((current) => {
          if (current && list.items.some((item) => item.id === current)) return current
          return list.items[0]?.id ?? null
        })
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载社区资源失败'
      const mockType = resourceType ?? 'mcp'
      if (COMMUNITY_UI_MOCK_ENABLED) {
        setItems(
          withUiMockItem([], getUiMockResource(mockType)).map(applyUiMockInteractionToResource),
        )
        setError(null)
      } else {
        setError(formatCommunityHubError(message))
        if (!isCommunityHubRateLimitError(message)) {
          setItems([])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [autoLoadDetail, cacheKey, listInput, resourceType, setError, setItems, setLoading, setSelectedId])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const resource = await getCommunityResource(id)
      setDetail(resource)
      setSelectedId(id)
      setItems((current) => current.map((item) => (item.id === id ? resource : item)))
      return resource
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载资源详情失败'
      setError(message)
      setDetail(null)
      throw loadError
    } finally {
      setDetailLoading(false)
    }
  }, [setDetail, setDetailLoading, setError, setItems, setSelectedId])

  const install = useCallback(
    async (input: CommunityInstallInput, selectedId: string | null) => {
      setInstallingId(input.resourceId)
      setError(null)
      try {
        const result = await installCommunityResource(input)
        await load()
        if (selectedId === input.resourceId) {
          await loadDetail(input.resourceId)
        }
        notifyCommunityUserDataChanged()
        return result
      } catch (installError) {
        const message = installError instanceof Error ? installError.message : '安装失败'
        setError(message)
        throw installError
      } finally {
        setInstallingId(null)
      }
    },
    [load, loadDetail, setError, setInstallingId],
  )

  return { load, loadDetail, install }
}
