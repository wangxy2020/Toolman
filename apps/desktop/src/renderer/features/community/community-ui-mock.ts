import type {
  CommunityBoardMessage,
  CommunityInstallItem,
  CommunityNewsArticle,
  CommunityResourceItem,
  CommunityResourceType,
  CommunityTaskItem,
} from '@toolman/shared'

/** Dev-only UI preview rows for community pages. Disabled so real data can be tested. */
export const COMMUNITY_UI_MOCK_ENABLED = false

const MOCK_NOW = Date.UTC(2026, 5, 1, 8, 0, 0)
const MOCK_AUTHOR = {
  id: '00000000-0000-4000-8000-000000000101',
  displayName: 'UI 预览用户',
}
const MOCK_PUBLISHER = {
  id: '00000000-0000-4000-8000-000000000102',
  displayName: 'UI 预览发布者',
}

export const COMMUNITY_UI_MOCK_IDS = {
  resource: '00000000-0000-4000-8000-000000000201',
  news: '00000000-0000-4000-8000-000000000202',
  message: '00000000-0000-4000-8000-000000000203',
  task: '00000000-0000-4000-8000-000000000204',
  install: '00000000-0000-4000-8000-000000000205',
  version: '00000000-0000-4000-8000-000000000206',
} as const

export function withUiMockItem<T extends { id: string }>(items: T[], mock: T): T[] {
  if (!COMMUNITY_UI_MOCK_ENABLED) return items
  if (items.some((item) => item.id === mock.id)) return items
  return [mock, ...items]
}

export function isUiMockCommunityId(id: string): boolean {
  return (Object.values(COMMUNITY_UI_MOCK_IDS) as string[]).includes(id)
}

function mockResource(resourceType: CommunityResourceType): CommunityResourceItem {
  const labels: Record<CommunityResourceType, string> = {
    mcp: 'MCP',
    skill: 'Skill',
    workflow: '工作流',
    task: '任务',
    knowledge: '知识库',
  }
  return {
    id: COMMUNITY_UI_MOCK_IDS.resource,
    title: `[UI 预览] ${labels[resourceType]} 示例资源`,
    description: '这是一条用于检查社区列表布局与字段展示的虚拟数据。',
    author: MOCK_AUTHOR,
    version: '1.0.0',
    tags: ['ui-preview', resourceType],
    category: 'preview',
    rating: 4.8,
    ratingCount: 12,
    downloadCount: 48,
    installCount: 36,
    favoriteCount: 9,
    likeCount: 24,
    dislikeCount: 2,
    commentCount: 0,
    resourceType,
    coverUrl: null,
    license: 'MIT',
    visibility: 'public',
    status: 'published',
    resourceSize: 2048,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  }
}

export function getUiMockResource(resourceType: CommunityResourceType): CommunityResourceItem {
  return mockResource(resourceType)
}

export function getUiMockNewsArticle(): CommunityNewsArticle {
  return {
    id: COMMUNITY_UI_MOCK_IDS.news,
    sourceId: '00000000-0000-4000-8000-000000000301',
    sourceTitle: 'UI 预览源',
    guid: 'ui-preview-news',
    title: '[UI 预览] Toolman 社区资讯示例',
    summary: '用于检查资讯列表标题、来源、时间与互动数据的展示效果。',
    contentHtml: null,
    link: 'https://example.com/ui-preview-news',
    author: 'UI 预览',
    tags: ['ui-preview'],
    coverUrl: null,
    publishedAt: MOCK_NOW,
    fetchedAt: MOCK_NOW,
    likeCount: 18,
    favoriteCount: 6,
    dislikeCount: 1,
    commentCount: 0,
    viewCount: 128,
    likedByMe: false,
    dislikedByMe: false,
    favoritedByMe: false,
  }
}

export function getUiMockBoardMessage(): CommunityBoardMessage {
  return {
    id: COMMUNITY_UI_MOCK_IDS.message,
    userId: MOCK_AUTHOR.id,
    author: MOCK_AUTHOR,
    parentId: null,
    body: '[UI 预览] 这是一条用于检查留言板列表布局的虚拟留言。',
    likeCount: 3,
    dislikeCount: 0,
    favoriteCount: 0,
    replyCount: 1,
    likedByMe: false,
    dislikedByMe: false,
    favoritedByMe: false,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  }
}

export function getUiMockTask(): CommunityTaskItem {
  return {
    id: COMMUNITY_UI_MOCK_IDS.task,
    title: '[UI 预览] 社区任务示例',
    description: '用于检查任务市场列表的标题、状态、预算与发布者信息展示。',
    publisher: MOCK_PUBLISHER,
    assigneeId: null,
    resourceId: null,
    taskType: 'development',
    budgetAmount: 500,
    budgetCurrency: 'CNY',
    deadlineAt: MOCK_NOW + 7 * 24 * 60 * 60 * 1000,
    status: 'open',
    tags: ['ui-preview', 'electron'],
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
    completedAt: null,
  }
}

export function getUiMockInstall(userId: string): CommunityInstallItem {
  return {
    id: COMMUNITY_UI_MOCK_IDS.install,
    userId,
    resourceId: COMMUNITY_UI_MOCK_IDS.resource,
    versionId: COMMUNITY_UI_MOCK_IDS.version,
    workspaceId: null,
    localRef: 'ui-preview/local-ref',
    installStatus: 'success',
    errorMessage: null,
    installedAt: MOCK_NOW,
    completedAt: MOCK_NOW,
  }
}
