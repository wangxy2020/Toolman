import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IpcChannel } from '@toolman/shared'

import {
  getCommunityNewsArticle,
  getCommunityResource,
  getCommunityTask,
  listCommunityNewsArticles,
  listCommunityResources,
  listCommunityTasks,
} from './community-api.client'

const invoke = vi.fn()

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
        items: [
          {
            id: '00000000-0000-0000-0000-000000000010',
            title: 'Demo MCP',
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
        id: '00000000-0000-0000-0000-000000000010',
        title: 'Demo MCP',
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

  it('loads community news list and article detail', async () => {
    invoke
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            {
              id: '00000000-0000-0000-0000-000000000020',
              sourceId: 'openai-news',
              sourceTitle: 'OpenAI',
              guid: 'news-1',
              title: 'News Title',
              summary: 'Summary',
              link: 'https://example.com/1',
              tags: [],
              publishedAt: 1,
              fetchedAt: 2,
              likeCount: 0,
              favoriteCount: 0,
              viewCount: 0,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: '00000000-0000-0000-0000-000000000020',
          sourceId: 'openai-news',
          sourceTitle: 'OpenAI',
          guid: 'news-1',
          title: 'News Title',
          summary: 'Summary',
          contentHtml: '<p>Body</p>',
          link: 'https://example.com/1',
          tags: [],
          publishedAt: 1,
          fetchedAt: 2,
          likeCount: 1,
          favoriteCount: 0,
          viewCount: 3,
        },
      })

    const list = await listCommunityNewsArticles({ sort: 'newest' })
    expect(list.items[0]?.title).toBe('News Title')

    const article = await getCommunityNewsArticle('00000000-0000-0000-0000-000000000020')
    expect(article.contentHtml).toBe('<p>Body</p>')
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

  it('loads news sources and comments', async () => {
    invoke
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            {
              id: '00000000-0000-0000-0000-000000000040',
              title: 'OpenAI Blog',
              feedUrl: 'https://example.com/feed.xml',
              siteUrl: 'https://example.com',
              category: 'ai',
              language: 'en',
              enabled: true,
              fetchIntervalMinutes: 60,
              createdAt: 1,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            {
              id: '00000000-0000-0000-0000-000000000041',
              articleId: '00000000-0000-0000-0000-000000000020',
              userId: '00000000-0000-0000-0000-000000000001',
              author: {
                id: '00000000-0000-0000-0000-000000000001',
                displayName: 'Reader',
              },
              body: 'Great article',
              likeCount: 0,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
        },
      })

    const { listCommunityNewsSources, listCommunityNewsComments } = await import(
      './community-api.client'
    )

    const sources = await listCommunityNewsSources()
    expect(sources.items[0]?.title).toBe('OpenAI Blog')

    const comments = await listCommunityNewsComments({
      articleId: '00000000-0000-0000-0000-000000000020',
    })
    expect(comments.items[0]?.body).toBe('Great article')
  })
})
