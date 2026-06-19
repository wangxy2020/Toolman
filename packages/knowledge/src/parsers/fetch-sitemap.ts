const DEFAULT_MAX_URLS = 500
const DEFAULT_MAX_SITEMAPS = 20

function parseLocTags(xml: string): string[] {
  const urls: string[] = []
  const pattern = /<loc[^>]*>([^<]+)<\/loc>/gi
  let match = pattern.exec(xml)
  while (match) {
    const loc = match[1]?.trim()
    if (loc) urls.push(loc)
    match = pattern.exec(xml)
  }
  return urls
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml)
}

async function fetchSitemapXml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Toolman/1.0 (Knowledge Bot)',
      Accept: 'application/xml, text/xml, */*;q=0.5',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`获取 Sitemap 失败（HTTP ${response.status}）`)
  }

  return response.text()
}

export interface FetchSitemapUrlsOptions {
  maxUrls?: number
  maxSitemaps?: number
}

export async function fetchSitemapUrls(
  sitemapUrl: string,
  options?: FetchSitemapUrlsOptions,
): Promise<string[]> {
  const trimmed = sitemapUrl.trim()
  if (!trimmed) {
    throw new Error('Sitemap URL 不能为空')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    throw new Error('Sitemap URL 格式无效')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('仅支持 http / https Sitemap')
  }

  const maxUrls = options?.maxUrls ?? DEFAULT_MAX_URLS
  const maxSitemaps = options?.maxSitemaps ?? DEFAULT_MAX_SITEMAPS
  const collected = new Set<string>()
  const pendingSitemaps = [parsedUrl.toString()]
  let processedSitemaps = 0

  while (pendingSitemaps.length > 0 && collected.size < maxUrls && processedSitemaps < maxSitemaps) {
    const current = pendingSitemaps.shift()!
    processedSitemaps += 1

    const xml = await fetchSitemapXml(current)
    const locs = parseLocTags(xml)

    if (isSitemapIndex(xml)) {
      for (const loc of locs) {
        if (pendingSitemaps.length + processedSitemaps >= maxSitemaps) break
        pendingSitemaps.push(loc)
      }
      continue
    }

    for (const loc of locs) {
      if (!/^https?:\/\//i.test(loc)) continue
      collected.add(loc)
      if (collected.size >= maxUrls) break
    }
  }

  if (collected.size === 0) {
    throw new Error('Sitemap 中未找到有效 URL')
  }

  return Array.from(collected)
}
