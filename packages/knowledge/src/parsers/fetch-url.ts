import { htmlToPlainText } from './parse-html.js'

export interface FetchedUrlContent {
  url: string
  title: string
  plainText: string
  html: string
  mimeType: string
}

export async function fetchUrlContent(url: string): Promise<FetchedUrlContent> {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('URL 不能为空')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    throw new Error('URL 格式无效')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('仅支持 http / https URL')
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      'User-Agent': 'Toolman/1.0 (Knowledge Bot)',
      Accept: 'text/html, text/plain, text/markdown, application/json;q=0.8, */*;q=0.5',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`获取 URL 失败（HTTP ${response.status}）`)
  }

  const contentType = response.headers.get('content-type') ?? 'text/html'
  const body = await response.text()

  if (contentType.includes('text/markdown') || parsedUrl.pathname.endsWith('.md')) {
    const title = parsedUrl.pathname.split('/').pop() || parsedUrl.hostname
    return {
      url: parsedUrl.toString(),
      title,
      plainText: body.trim(),
      html: body,
      mimeType: 'text/markdown',
    }
  }

  if (contentType.includes('text/plain') && !contentType.includes('html')) {
    return {
      url: parsedUrl.toString(),
      title: parsedUrl.hostname,
      plainText: body.trim(),
      html: body,
      mimeType: 'text/plain',
    }
  }

  const extracted = htmlToPlainText(body)
  if (!extracted.plainText) {
    throw new Error('网页未提取到正文内容')
  }

  return {
    url: parsedUrl.toString(),
    title: extracted.title || parsedUrl.hostname,
    plainText: extracted.plainText,
    html: body,
    mimeType: 'text/html',
  }
}
