import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/toolman-test-community',
  },
}))

import { IpcChannel, ipcOk } from '@toolman/shared'

import { communityHandlers } from './community-handlers'

vi.mock('../services/community/community-ipc.facade', () => ({
  getHubStatus: vi.fn(async () => ({
    running: true,
    port: 3721,
    host: '127.0.0.1',
    baseUrl: 'http://127.0.0.1:3721',
    binaryPath: '/tmp/toolman-community-hub',
  })),
  cancelTask: vi.fn(),
  deleteTask: vi.fn(async () => ({ deleted: true })),
  listResources: vi.fn(async () => ({
    items: [
      {
        id: '00000000-0000-0000-0000-000000000010',
        title: 'Renderer List',
        description: 'desc',
        author: {
          id: '00000000-0000-0000-0000-000000000001',
          displayName: 'Admin',
        },
        version: '1.0.0',
        tags: [],
        category: 'tools',
        rating: 0,
        ratingCount: 0,
        downloadCount: 0,
        installCount: 0,
        favoriteCount: 0,
        resourceType: 'mcp',
        license: 'MIT',
        visibility: 'public',
        status: 'published',
        resourceSize: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
  })),
  listNewsArticles: vi.fn(async () => ({
    items: [
      {
        id: '00000000-0000-0000-0000-000000000020',
        title: 'News headline',
        summary: 'Summary',
        sourceId: '00000000-0000-0000-0000-000000000021',
        sourceTitle: 'RSS',
        publishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        likeCount: 0,
        dislikeCount: 0,
        favoriteCount: 0,
        commentCount: 0,
        liked: false,
        disliked: false,
        favorited: false,
      },
    ],
  })),
}))

describe('community IPC handlers', () => {
  it('exposes community:resource:list handler for renderer invoke', async () => {
    const handler = communityHandlers[IpcChannel.CommunityResourceList]
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({ resourceType: 'mcp' })
    expect(result).toEqual(
      ipcOk({
        items: [
          expect.objectContaining({
            title: 'Renderer List',
            resourceType: 'mcp',
          }),
        ],
      }),
    )
  })

  it('exposes community:board:messages:list handler for renderer invoke', () => {
    expect(communityHandlers[IpcChannel.CommunityBoardMessageList]).toBeTypeOf('function')
    expect(communityHandlers[IpcChannel.CommunityBoardMessageCreate]).toBeTypeOf('function')
  })

  it('exposes community:task:delete handler for renderer invoke', () => {
    expect(communityHandlers[IpcChannel.CommunityTaskDelete]).toBeTypeOf('function')
  })

  it('exposes community:news:list handler for renderer invoke', async () => {
    const handler = communityHandlers[IpcChannel.CommunityNewsList]
    expect(handler).toBeTypeOf('function')

    const result = await handler?.({ limit: 10 })
    expect(result).toEqual(
      ipcOk({
        items: [
          expect.objectContaining({
            title: 'News headline',
          }),
        ],
      }),
    )
  })
})
