import { describe, expect, it } from 'vitest'
import {
  isDirectNewsItemId,
  parseRssOrAtomFeed,
} from './communityNewsDirect'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>少数派</title>
    <item>
      <title>测试文章 A</title>
      <link>https://sspai.com/post/1</link>
      <pubDate>Wed, 03 Sep 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>摘要一</p>]]></description>
    </item>
    <item>
      <title>测试文章 B</title>
      <link>https://sspai.com/post/2</link>
      <pubDate>Wed, 03 Sep 2026 12:00:00 GMT</pubDate>
      <description>摘要二</description>
    </item>
  </channel>
</rss>`

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>OpenAI News</title>
  <entry>
    <title>Hello Atom</title>
    <link href="https://openai.com/news/hello"/>
    <published>2026-09-03T08:00:00Z</published>
    <summary>Atom summary</summary>
  </entry>
</feed>`

describe('communityNewsDirect', () => {
  it('parses RSS items into community news cards', () => {
    const items = parseRssOrAtomFeed(SAMPLE_RSS, { id: 'sspai', title: '少数派' })
    expect(items).toHaveLength(2)
    expect(items[0]?.title).toBe('测试文章 A')
    expect(items[0]?.link).toBe('https://sspai.com/post/1')
    expect(items[0]?.body).toContain('摘要一')
    expect(isDirectNewsItemId(items[0]?.id ?? '')).toBe(true)
  })

  it('parses Atom entries including href links', () => {
    const items = parseRssOrAtomFeed(SAMPLE_ATOM, { id: 'openai-news', title: 'OpenAI News' })
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe('Hello Atom')
    expect(items[0]?.link).toBe('https://openai.com/news/hello')
    expect(items[0]?.description).toContain('Atom summary')
  })
})
