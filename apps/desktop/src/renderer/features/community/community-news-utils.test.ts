import { describe, expect, it } from 'vitest'

import {
  isScrapedPageShellHtml,
  resolveNewsArticleBodyHtml,
  shouldSimplifyArticleHtml,
  simplifyScrapedArticleHtml,
  summaryToArticleHtml,
} from './community-news-utils'

const OPENAI_SHELL_SNIPPET = `
<article class="flex min-w-0 flex-col gap-12 @md:gap-16 mt-10">
  <div class="@container w-full max-w-container">
    <h2 class="text-h3"><span>New credit usage analytics</span></h2>
    <p class="mb-6"><span>As AI becomes part of everyday work, organizations need the ability to manage it.</span></p>
    <p class="mb-6"><span>Today, we are introducing credit usage analytics and updated spend controls for ChatGPT Enterprise.</span></p>
    <ul class="list-disc"><li class="mb-2"><span>Track usage and credit trends over time</span></li></ul>
    <a href="/contact-sales/">Contact sales</a>
  </div>
</article>
`.repeat(20)

const KR36_SHELL_SNIPPET = `
<div class="article-content"><div class="article-mian-content"><div class="article-wrapper common-width">
  <h1 class="article-title">中国游戏的错位竞争</h1>
  <p>头部厂商押注3A，腰部厂商吃存量。</p>
  <p>行业正在进入错位竞争阶段。</p>
  <a href="/user/6371858">作者</a>
</div></div></div>
`.repeat(8)

describe('community-news-utils', () => {
  it('detects scraped page shell html', () => {
    expect(isScrapedPageShellHtml(OPENAI_SHELL_SNIPPET)).toBe(true)
    expect(isScrapedPageShellHtml(KR36_SHELL_SNIPPET)).toBe(true)
    expect(isScrapedPageShellHtml('<p>Short plain summary</p>')).toBe(false)
  })

  it('marks complex article html for simplification', () => {
    expect(shouldSimplifyArticleHtml(KR36_SHELL_SNIPPET)).toBe(true)
    expect(shouldSimplifyArticleHtml('<p><h2>Section</h2></p><p>Short body text here.</p>')).toBe(false)
  })

  it('simplifies scraped page shell into readable blocks', () => {
    const simplified = simplifyScrapedArticleHtml(
      OPENAI_SHELL_SNIPPET,
      'https://openai.com/index/chatgpt-enterprise-spend-controls',
    )

    expect(simplified).toContain('<h2>New credit usage analytics</h2>')
    expect(simplified).toContain('credit usage analytics')
    expect(simplified).not.toContain('@container')
    expect(simplified).not.toContain('radix-')
    expect(simplified.length).toBeLessThan(OPENAI_SHELL_SNIPPET.length / 4)
  })

  it('resolves article body html without returning raw page shell', () => {
    const body = resolveNewsArticleBodyHtml({
      title: 'New usage analytics and updated spend controls for enterprises',
      summary: 'OpenAI introduces new spend controls and usage analytics.',
      contentHtml: OPENAI_SHELL_SNIPPET,
      link: 'https://openai.com/index/chatgpt-enterprise-spend-controls',
    })

    expect(body).toContain('<p>')
    expect(body).not.toContain('@container')
    expect(body).not.toContain('<button')
  })

  it('renders plain summary as html paragraphs for rss-only articles', () => {
    const body = resolveNewsArticleBodyHtml({
      title: 'Waymo召回自动驾驶出租车',
      summary: 'Waymo宣布召回数千辆自动驾驶出租车，隐患为车辆可能高速驶入施工路段。',
      contentHtml: null,
      link: 'https://36kr.com/newsflashes/123',
    })

    expect(body).toBe(
      '<p>Waymo宣布召回数千辆自动驾驶出租车，隐患为车辆可能高速驶入施工路段。</p>',
    )
    expect(summaryToArticleHtml('第一段\n\n第二段')).toBe('<p>第一段</p>\n<p>第二段</p>')
  })

  it('simplifies 36kr article html instead of rendering page chrome', () => {
    const body = resolveNewsArticleBodyHtml({
      title: '中国游戏的错位竞争',
      summary: '头部赌3A，腰部吃存量。',
      contentHtml: KR36_SHELL_SNIPPET,
      link: 'https://36kr.com/p/123',
    })

    expect(body).toContain('错位竞争')
    expect(body).not.toContain('article-mian-content')
    expect(body).not.toContain('href="/user/')
  })

  it('keeps lightweight semantic html for already-clean articles', () => {
    const body = resolveNewsArticleBodyHtml({
      title: 'Using AI to help physicians',
      summary: 'Researchers used an OpenAI reasoning model to reanalyze cases.',
      contentHtml: '<h2>Why an old case can contain a new answer</h2><p>In an NEJM AI study, experts used an OpenAI reasoning model to reanalyze 376 patient records.</p>',
      link: 'https://openai.com/index/example',
    })

    expect(body).toContain('<h2>Why an old case can contain a new answer</h2>')
    expect(body).toContain('<p>In an NEJM AI study')
  })
})
