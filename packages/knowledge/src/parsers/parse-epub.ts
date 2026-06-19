import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { htmlToPlainText } from './parse-html.js'

function extractOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/i)
  return match?.[1] ?? null
}

function extractSpineItemRefs(opfXml: string): string[] {
  const refs: string[] = []
  const pattern = /<itemref[^>]*idref="([^"]+)"/gi
  let match = pattern.exec(opfXml)
  while (match) {
    if (match[1]) refs.push(match[1])
    match = pattern.exec(opfXml)
  }
  return refs
}

function extractManifestHrefs(opfXml: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi
  let match = pattern.exec(opfXml)
  while (match) {
    if (match[1] && match[2]) map.set(match[1], match[2])
    match = pattern.exec(opfXml)
  }
  return map
}

function resolveZipPath(baseDir: string, href: string): string {
  const normalized = href.replace(/\\/g, '/')
  if (!baseDir) return normalized
  const base = baseDir.replace(/\\/g, '/').replace(/\/$/, '')
  if (normalized.startsWith('/')) return normalized.slice(1)
  return `${base}/${normalized}`
}

export async function extractEpubPlainText(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(filePath))

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) {
    throw new Error('EPUB 缺少 container.xml')
  }

  const containerXml = await containerFile.async('text')
  const opfPath = extractOpfPath(containerXml)
  if (!opfPath) {
    throw new Error('EPUB 未找到 OPF 文件路径')
  }

  const opfFile = zip.file(opfPath)
  if (!opfFile) {
    throw new Error('EPUB 未找到 OPF 文件')
  }

  const opfXml = await opfFile.async('text')
  const manifest = extractManifestHrefs(opfXml)
  const spineRefs = extractSpineItemRefs(opfXml)
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''

  const parts: string[] = []
  for (const idref of spineRefs) {
    const href = manifest.get(idref)
    if (!href) continue

    const itemPath = resolveZipPath(opfDir, href)
    const itemFile = zip.file(itemPath)
    if (!itemFile) continue

    const content = await itemFile.async('text')
    const extracted = htmlToPlainText(content)
    const text = extracted.plainText.trim()
    if (text) parts.push(text)
  }

  return parts.join('\n\n').trim()
}
