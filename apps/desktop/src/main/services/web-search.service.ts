export async function searchWeb(
  query: string,
  provider: 'duckduckgo' | 'bing' | 'google' = 'duckduckgo',
): Promise<string> {
  const trimmed = query.trim()
  if (!trimmed) return '搜索关键词为空。'

  if (provider === 'duckduckgo') {
    return searchDuckDuckGo(trimmed)
  }

  return searchHtmlLite(trimmed, provider)
}

async function searchDuckDuckGo(query: string): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Toolman/1.0' },
  })
  if (!response.ok) {
    throw new Error(`网络搜索失败（${response.status}）`)
  }

  const data = (await response.json()) as {
    AbstractText?: string
    Heading?: string
    RelatedTopics?: Array<{ Text?: string } | { Topics?: Array<{ Text?: string }> }>
  }

  const parts: string[] = []
  if (data.Heading && data.AbstractText) {
    parts.push(`${data.Heading}: ${data.AbstractText}`)
  } else if (data.AbstractText) {
    parts.push(data.AbstractText)
  }

  const related: string[] = []
  for (const topic of data.RelatedTopics ?? []) {
    if ('Text' in topic && topic.Text) related.push(topic.Text)
    if ('Topics' in topic && topic.Topics) {
      for (const nested of topic.Topics) {
        if (nested.Text) related.push(nested.Text)
      }
    }
    if (related.length >= 5) break
  }

  if (related.length > 0) {
    parts.push('相关结果：')
    parts.push(...related.slice(0, 5).map((item) => `- ${item}`))
  }

  if (parts.length > 0) return parts.join('\n')
  return searchHtmlLite(query, 'duckduckgo')
}

async function searchHtmlLite(
  query: string,
  provider: 'duckduckgo' | 'bing' | 'google',
): Promise<string> {
  const searchUrl =
    provider === 'bing'
      ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      : provider === 'google'
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
  })

  if (!response.ok) {
    throw new Error(`网络搜索失败（${response.status}）`)
  }

  const html = await response.text()
  const snippets = extractSnippets(html).slice(0, 5)
  if (snippets.length === 0) {
    return `未检索到关于「${query}」的有效摘要，请结合已有知识回答。`
  }

  return snippets.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

function extractSnippets(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const sentences = text
    .split(/[.!?。！？]\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 40 && item.length <= 240)

  const unique = new Set<string>()
  const results: string[] = []
  for (const sentence of sentences) {
    if (unique.has(sentence)) continue
    unique.add(sentence)
    results.push(sentence)
    if (results.length >= 8) break
  }

  return results
}
