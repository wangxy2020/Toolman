import { parsePdfWithOpenDataLoader } from '@toolman/opendataloader'
import {
  guardOdlDocumentPages,
  resolveOdlPageContent,
  extractPdfPageTexts,
  splitPdfPagesByMarkers,
  pickLongestUsableOdlBody,
} from '@toolman/knowledge'

const filePath = process.argv[2]
const startPage = Number(process.argv[3] ?? 1)
const endPage = Number(process.argv[4] ?? startPage)

if (!filePath) {
  console.error('Usage: tsx scripts/debug-odl-preview.mjs <pdf> [start] [end]')
  process.exit(1)
}

async function main() {
  console.log('=== Raw ODL ===')
  const raw = await parsePdfWithOpenDataLoader(
    { filePath, profile: 'translation', pageRange: { start: startPage, end: endPage } },
    { timeoutMs: 120000 },
  )
  console.log('totalPages:', raw.totalPages)
  console.log('pages.length:', raw.pages.length)
  console.log('plainText.len:', raw.plainText.length)
  console.log('markdown.len:', raw.markdown.length)
  console.log('plainText preview:', JSON.stringify(raw.plainText.slice(0, 300)))
  console.log('markdown preview:', JSON.stringify(raw.markdown.slice(0, 300)))
  console.log('marker split count:', splitPdfPagesByMarkers(raw.plainText).length)
  console.log('md marker split count:', splitPdfPagesByMarkers(raw.markdown).length)
  console.log('page1 raw:', JSON.stringify(raw.pages[0]?.text?.slice(0, 150)))

  console.log('\n=== After guard ===')
  const guarded = guardOdlDocumentPages({
    pages: raw.pages,
    plainText: raw.plainText,
    markdown: raw.markdown,
    totalPages: raw.totalPages,
  })
  console.log('guarded pages:', guarded.length)
  for (const p of guarded.filter((x) => x.pageNumber <= 3)) {
    console.log(`  page ${p.pageNumber}: text.len=${p.text.length} blankOrNoise=${p.isBlankOrNoise} preview=${JSON.stringify(p.text.slice(0, 80))}`)
  }

  console.log('\n=== resolveOdlPageContent (raw doc) ===')
  for (let n = 1; n <= Math.min(3, endPage); n++) {
    const r = resolveOdlPageContent(n, raw)
    console.log(`  page ${n}: len=${r.text.length} blankOrNoise=${r.isBlankOrNoise} preview=${JSON.stringify(r.text.slice(0, 80))}`)
  }

  console.log('\n=== pickLongestUsableOdlBody ===')
  console.log('body len:', pickLongestUsableOdlBody(raw.plainText, raw.markdown).length)

  console.log('\n=== pdf.js extract ===')
  const extracted = await extractPdfPageTexts(filePath, startPage, Math.min(startPage + 2, endPage))
  console.log('extracted totalPages:', extracted.totalPages)
  for (const p of extracted.pages) {
    console.log(`  page ${p.pageNumber}: len=${p.text.length} preview=${JSON.stringify(p.text.slice(0, 80))}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
