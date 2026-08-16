/** XML cost document parsers. */

import type { PmCostType } from './pm-cost-catalog'
import { draftFromLooseFields, type DraftRow } from './pm-cost-import-draft'
import { mapHeaderToField } from './pm-cost-import-types'

function collectXmlObjectFields(element: Element): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const attr of Array.from(element.attributes)) {
    fields[attr.name] = attr.value
  }
  for (const child of Array.from(element.children)) {
    if (child.children.length === 0) {
      fields[child.tagName] = child.textContent?.trim() ?? ''
    }
  }
  return fields
}

function extractTagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = []
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'gi')
  let match = pattern.exec(xml)
  while (match) {
    blocks.push(match[1] ?? '')
    match = pattern.exec(xml)
  }
  return blocks
}

function extractChildFieldsFromXmlBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const pattern =
    /<([A-Za-z_\u4e00-\u9fff][\w.\-:\u4e00-\u9fff]*)(?:\s[^>]*)?>([^<]*?)<\/\1>/g
  let match = pattern.exec(block)
  while (match) {
    const tag = match[1] ?? ''
    const value = (match[2] ?? '').trim()
    if (tag && !(tag in fields)) fields[tag] = value
    match = pattern.exec(block)
  }
  return fields
}

function parseXmlCostDocumentWithoutDom(
  xmlText: string,
  fallbackType: PmCostType,
): DraftRow[] {
  const preferTags = [
    '清单项目',
    '分部分项',
    '定额子目',
    '工料机',
    'Item',
    'BQItem',
    'NormItem',
    'Resource',
    'BillItem',
    'ProjectItem',
  ]
  const drafts: DraftRow[] = []
  for (const tag of preferTags) {
    for (const block of extractTagBlocks(xmlText, tag)) {
      const draft = draftFromLooseFields(
        extractChildFieldsFromXmlBlock(block),
        fallbackType,
      )
      if (draft) drafts.push(draft)
    }
    if (drafts.length > 0) return drafts
  }
  return drafts
}

/** Extract cost drafts from generic / bidding XML documents. */
export function parseXmlCostDocument(
  xmlText: string,
  options?: { fallbackType?: PmCostType },
): DraftRow[] {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  if (typeof DOMParser === 'undefined') {
    return parseXmlCostDocumentWithoutDom(xmlText, fallbackType)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('XML 解析失败')
  }

  const drafts: DraftRow[] = []
  const seen = new Set<Element>()

  const preferSelectors = [
    '清单项目',
    '分部分项',
    '定额子目',
    '工料机',
    'Item',
    'BQItem',
    'NormItem',
    'Resource',
    'BillItem',
    'ProjectItem',
  ]
  for (const tag of preferSelectors) {
    for (const el of Array.from(doc.getElementsByTagName(tag))) {
      if (seen.has(el)) continue
      seen.add(el)
      const draft = draftFromLooseFields(collectXmlObjectFields(el), fallbackType)
      if (draft) drafts.push(draft)
    }
  }

  if (drafts.length > 0) return drafts

  // Fallback: any element whose children look like a cost row.
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (seen.has(el) || el.children.length === 0) continue
    const fields = collectXmlObjectFields(el)
    const mappedCount = Object.keys(fields).reduce(
      (count, key) => (mapHeaderToField(key) ? count + 1 : count),
      0,
    )
    if (mappedCount < 2) continue
    seen.add(el)
    const draft = draftFromLooseFields(fields, fallbackType)
    if (draft) drafts.push(draft)
  }
  return drafts
}
