import { formatCommunityDateTime, formatNewsPreview, htmlToPlainText } from './communityListFormat'
import type { CommunityListItem } from './communityHubClient-types'

export const DIRECT_NEWS_ID_PREFIX = 'direct:'

export const DEFAULT_DIRECT_NEWS_FEEDS = [
  {
    id: 'sspai',
    title: '少数派',
    feedUrl: 'https://sspai.com/feed',
  },
  {
    id: 'openai-news',
    title: 'OpenAI News',
    feedUrl: 'https://openai.com/news/rss.xml',
  },
  {
    id: 'infoq-cn',
    title: 'InfoQ 中文',
    feedUrl: 'https://www.infoq.cn/feed',
  },
  {
    id: '36kr',
    title: '36氪',
    feedUrl: 'https://36kr.com/feed',
  },
] as const

const FEED_TIMEOUT_MS = 12_000
const ITEMS_PER_FEED = 12
const MAX_ITEMS = 30

export function isDirectNewsItemId(id: string): boolean {
  return id.startsWith(DIRECT_NEWS_ID_PREFIX)
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCharCode(n) : ''
    })
    .trim()
}

function firstTag(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
    if (match?.[1]) return decodeXmlText(match[1])
  }
  return ''
}

function firstLink(block: string): string {
  const tagged = firstTag(block, ['link', 'id'])
  if (/^https?:\/\//i.test(tagged)) return tagged
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)
  return href?.[1]?.trim() ?? ''
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stableItemId(sourceId: string, link: string, title: string): string {
  const raw = `${sourceId}:${link || title}`
  let hash = 2166136261
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${DIRECT_NEWS_ID_PREFIX}${sourceId}:${(hash >>> 0).toString(16)}`
}

export function parseRssOrAtomFeed(
  xml: string,
  source: { id: string; title: string },
): CommunityListItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map(
    (match) => match[2] ?? '',
  )
  return blocks.slice(0, ITEMS_PER_FEED).flatMap((block, index) => {
    const title = firstTag(block, ['title']) || '未命名资讯'
    const link = firstLink(block)
    const html = firstTag(block, ['content:encoded', 'content', 'description', 'summary'])
    const publishedAt =
      parseTimestamp(firstTag(block, ['pubDate', 'published', 'updated', 'dc:date'])) ||
      Date.now() - index
    const plain = htmlToPlainText(html) || title
    return [
      {
        id: stableItemId(source.id, link, title),
        title,
        meta: [source.title, formatCommunityDateTime(publishedAt)].filter(Boolean).join(' · '),
        description: formatNewsPreview(plain),
        createdAt: publishedAt,
        likeCount: 0,
        dislikeCount: 0,
        favoriteCount: 0,
        commentCount: 0,
        coverUrl: null,
        iconKind: 'news' as const,
        summary: formatNewsPreview(plain, 240) || undefined,
        contentHtml: html || undefined,
        body: plain,
        link: link || null,
      } satisfies CommunityListItem,
    ]
  })
}

async function fetchFeedXml(feedUrl: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
  try {
    const response = await fetch(feedUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'User-Agent':
          'Mozilla/5.0 (compatible; Toolman-Community-News/1.0; +https://toolman.work/rss-reader)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`RSS ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch default public RSS feeds. Used by native clients and the web API. */
export async function fetchDirectCommunityNewsFromFeeds(): Promise<CommunityListItem[]> {
  const settled = await Promise.allSettled(
    DEFAULT_DIRECT_NEWS_FEEDS.map(async (source) => {
      const xml = await fetchFeedXml(source.feedUrl)
      return parseRssOrAtomFeed(xml, source)
    }),
  )
  const items = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  return items
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_ITEMS)
}

export async function fetchDirectCommunityNewsViaApi(
  requestUrl = '/api/community-news',
): Promise<CommunityListItem[]> {
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  const text = await response.text()
  let payload: { ok?: boolean; data?: CommunityListItem[]; error?: { message?: string } }
  try {
    payload = text ? (JSON.parse(text) as typeof payload) : {}
  } catch {
    throw new Error(`资讯接口返回无效 JSON (${response.status})`)
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error?.message ?? `资讯拉取失败 (${response.status})`)
  }
  return Array.isArray(payload.data) ? payload.data : []
}

const DIRECT_NEWS_CACHE_KEY = 'toolman.community.directNews.v1'
const DIRECT_NEWS_CACHE_TTL_MS = 20 * 60 * 1000

type DirectNewsCachePayload = {
  fetchedAt: number
  items: CommunityListItem[]
}

let memoryNewsCache: DirectNewsCachePayload | null = null

function newsStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    return storage ?? null
  } catch {
    return null
  }
}

export function readCachedDirectNews(
  maxAgeMs = DIRECT_NEWS_CACHE_TTL_MS,
): CommunityListItem[] | null {
  const now = Date.now()
  if (memoryNewsCache && now - memoryNewsCache.fetchedAt <= maxAgeMs) {
    return memoryNewsCache.items
  }
  const raw = newsStorage()?.getItem(DIRECT_NEWS_CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DirectNewsCachePayload
    if (!Array.isArray(parsed.items) || typeof parsed.fetchedAt !== 'number') return null
    if (now - parsed.fetchedAt > maxAgeMs) return null
    memoryNewsCache = parsed
    return parsed.items
  } catch {
    return null
  }
}

export function writeCachedDirectNews(items: CommunityListItem[]): void {
  if (items.length === 0) return
  const payload: DirectNewsCachePayload = { fetchedAt: Date.now(), items }
  memoryNewsCache = payload
  try {
    newsStorage()?.setItem(DIRECT_NEWS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — memory cache still helps within this session.
  }
}

export function clearCachedDirectNews(): void {
  memoryNewsCache = null
  try {
    newsStorage()?.removeItem(DIRECT_NEWS_CACHE_KEY)
  } catch {
    // ignore
  }
}
