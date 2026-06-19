import * as cheerio from 'cheerio'

export function htmlToPlainText(html: string): { title: string; plainText: string } {
  const $ = cheerio.load(html)
  $('script, style, nav, footer, aside, noscript, iframe').remove()

  const title = $('title').first().text().trim()
  const main = $('article, main, [role="main"]').first()
  const rawText = (main.length ? main.text() : $('body').text())
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, plainText: rawText }
}
