import { readFileSync } from 'node:fs'
import JSZip from 'jszip'

function extractTextFromSlideXml(xml: string): string {
  const lines: string[] = []
  const pattern = /<a:t[^>]*>([^<]*)<\/a:t>/g
  let match = pattern.exec(xml)
  while (match) {
    const text = match[1]?.trim()
    if (text) lines.push(text)
    match = pattern.exec(xml)
  }
  return lines.join('\n')
}

export async function extractPptxPlainText(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(filePath))
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNum = Number(left.match(/slide(\d+)/i)?.[1] ?? 0)
      const rightNum = Number(right.match(/slide(\d+)/i)?.[1] ?? 0)
      return leftNum - rightNum
    })

  const parts: string[] = []
  for (const slideName of slideNames) {
    const file = zip.files[slideName]
    if (!file) continue
    const xml = await file.async('text')
    const text = extractTextFromSlideXml(xml).trim()
    if (text) parts.push(text)
  }

  return parts.join('\n\n').trim()
}
