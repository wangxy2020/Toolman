import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IpcChannel } from '@toolman/shared'

import {
  getCommunityResource,
  getCommunityTask,
  listCommunityResources,
  listCommunityTasks,
} from './community-api.client'

const invoke = vi.fn()

const RESOURCE_ITEM = {
  id: '00000000-0000-0000-0000-000000000010',
  title: 'Demo MCP',
  description: 'desc',
  author: {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Admin',
  },
  version: '1.0.0',
  tags: [] as string[],
  category: 'tools',
  rating: 0,
  ratingCount: 0,
  downloadCount: 0,
  installCount: 0,
  favoriteCount: 0,
  resourceType: 'mcp' as const,
  license: 'MIT',
  visibility: 'public' as const,
  status: 'published' as const,
  resourceSize: 0,
  createdAt: 1,
  updatedAt: 2,
}

beforeEach(() => {
  invoke.mockReset()
  vi.stubGlobal('window', {
    api: {
      invoke,
    },
  })
})

describe('community-api.client', () => {
  it('loads community resource list', async () => {
    invoke.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [RESOURCE_ITEM],
      },
    })

    const result = await listCommunityResources({ resourceType: 'mcp' })
    expect(invoke).toHaveBeenCalledWith(IpcChannel.CommunityResourceList, { resourceType: 'mcp' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.title).toBe('Demo MCP')
  })

  it('loads community resource detail', async () => {
    invoke.mockResolvedValueOnce({
      ok: true,
      data: {
        ...RESOURCE_ITEM,
        description: 'detail',
        manifestJson: { schemaVersion: 1 },
      },
    })

    const detail = await getCommunityResource('00000000-0000-0000-0000-000000000010')
    expect(invoke).toHaveBeenCalledWith(IpcChannel.CommunityResourceGet, {
      id: '00000000-0000-0000-0000-000000000010',
    })
    expect(detail.title).toBe('Demo MCP')
  })

  it('loads community task list and detail', async () => {
    invoke
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            {
              id: '00000000-0000-0000-0000-000000000030',
              title: 'Build MCP',
              description: 'Task desc',
              publisher: {
                id: '00000000-0000-0000-0000-000000000001',
                displayName: 'Admin',
              },
              taskType: 'development',
              budgetAmount: 100,
              budgetCurrency: 'USD',
              status: 'open',
              tags: [],
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: '00000000-0000-0000-0000-000000000030',
          title: 'Build MCP',
          description: 'Task desc with detail',
          publisher: {
            id: '00000000-0000-0000-0000-000000000001',
            displayName: 'Admin',
          },
          taskType: 'development',
          budgetAmount: 100,
          budgetCurrency: 'USD',
          status: 'open',
          tags: ['mcp'],
          createdAt: 1,
          updatedAt: 2,
        },
      })

    const list = await listCommunityTasks({ status: 'open' })
    expect(list.items[0]?.title).toBe('Build MCP')

    const task = await getCommunityTask('00000000-0000-0000-0000-000000000030')
    expect(task.description).toBe('Task desc with detail')
  })

  it('throws ipc errors', async () => {
    invoke.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Community hub is not running',
        retryable: true,
      },
    })

    await expect(listCommunityResources()).rejects.toThrow('Community hub is not running')
  })

})
