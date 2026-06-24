import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fromApiJson, toApiJson, buildApiQuery } from './community-case'
import { listResources, createTask } from './community-ipc.facade'

const getCommunityHttpClient = vi.fn()

vi.mock('./community-bridge.service', () => ({
  getCommunityHttpClient: () => getCommunityHttpClient(),
  getCommunityHubStatus: () => ({
    running: true,
    mode: 'local',
    port: 3721,
    host: '127.0.0.1',
    baseUrl: 'http://127.0.0.1:3721',
    binaryPath: '/tmp/toolman-community-hub',
    offlineReadOnly: false,
  }),
  markCommunityHubOfflineReadOnly: vi.fn(),
}))

describe('community-case', () => {
  it('converts snake_case API payloads to camelCase', () => {
    expect(
      fromApiJson({
        resource_type: 'mcp',
        rating_count: 3,
        author: { display_name: 'Alice' },
      }),
    ).toEqual({
      resourceType: 'mcp',
      ratingCount: 3,
      author: { displayName: 'Alice' },
    })
  })

  it('converts camelCase IPC input to snake_case API body', () => {
    expect(
      toApiJson({
        resourceType: 'skill',
        workspaceId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      resource_type: 'skill',
      workspace_id: '00000000-0000-0000-0000-000000000001',
    })
  })

  it('builds query strings with snake_case keys', () => {
    expect(
      buildApiQuery({
        resource_type: 'mcp',
        limit: 20,
        tags: ['ai', 'tools'],
      }),
    ).toBe('?resource_type=mcp&limit=20&tags=ai%2Ctools')
  })
})

describe('community-ipc.facade listResources', () => {
  beforeEach(() => {
    getCommunityHttpClient.mockReset()
  })

  it('maps hub resource list to IPC output', async () => {
    const get = vi.fn(async (path: string) => {
      expect(path).toContain('/api/v1/marketplace/resources')
      expect(path).toContain('resource_type=mcp')
      return [
        {
          id: '00000000-0000-0000-0000-000000000010',
          title: 'Demo MCP',
          description: 'desc',
          author: {
            id: '00000000-0000-0000-0000-000000000001',
            display_name: 'Admin',
          },
          version: '1.0.0',
          tags: ['demo'],
          category: 'tools',
          rating: 4.5,
          rating_count: 2,
          download_count: 10,
          install_count: 5,
          favorite_count: 1,
          resource_type: 'mcp',
          cover_url: null,
          license: 'MIT',
          visibility: 'public',
          status: 'published',
          resource_size: 1024,
          created_at: 1,
          updated_at: 2,
        },
      ]
    })

    getCommunityHttpClient.mockReturnValue({ get })

    const result = await listResources({ resourceType: 'mcp', limit: 20 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.title).toBe('Demo MCP')
    expect(result.items[0]?.resourceType).toBe('mcp')
    expect(result.items[0]?.author.displayName).toBe('Admin')
  })
})

describe('community-ipc.facade createTask', () => {
  beforeEach(() => {
    getCommunityHttpClient.mockReset()
  })

  it('maps snake_case task payloads to IPC task items', async () => {
    const post = vi.fn(async (path: string) => {
      expect(path).toBe('/api/v1/tasks')
      return {
        id: '00000000-0000-4000-8000-000000000301',
        title: '测试任务',
        description: '任务描述',
        publisher: {
          id: '00000000-0000-4000-8000-000000000101',
          display_name: '发布者',
        },
        task_type: 'development',
        budget_amount: 100,
        budget_currency: 'CNY',
        status: 'draft',
        tags: ['test'],
        created_at: 1_700_000_000_000,
        updated_at: 1_700_000_000_000,
      }
    })

    getCommunityHttpClient.mockReturnValue({ post })

    const result = await createTask({
      title: '测试任务',
      description: '任务描述',
      taskType: 'development',
      budgetAmount: 100,
      budgetCurrency: 'CNY',
      tags: ['test'],
    })

    expect(result.title).toBe('测试任务')
    expect(result.publisher.displayName).toBe('发布者')
    expect(result.taskType).toBe('development')
    expect(result.budgetAmount).toBe(100)
    expect(result.createdAt).toBe(1_700_000_000_000)
  })
})
