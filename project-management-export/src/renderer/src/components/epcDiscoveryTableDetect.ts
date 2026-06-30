import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'

import { EPC_COMMERCIAL_REPORT_TITLE, EPC_WORK5_PAYMENT_REPORT_TITLE } from '@shared/epcCommercialTypes'

import { EPC_DISCOVERY_TABLE_CLASS, formatEpcDiscoveryTableHtml, type EpcDiscoveryTableRow } from './epcDiscoveryTable'

const DISCOVERY_HEADER_FILE = '文件名'
const DISCOVERY_HEADER_QUEUE = '分类'
const DISCOVERY_HEADER_DESC = '说明'

export const isEpcDiscoveryTableHeaderCells = (headers: string[]): boolean => {
  const normalized = headers.map((cell) => cell.replace(/\s+/g, '').trim())
  return (
    normalized.length === 3 &&
    normalized[0] === DISCOVERY_HEADER_FILE &&
    normalized[1] === DISCOVERY_HEADER_QUEUE &&
    normalized[2] === DISCOVERY_HEADER_DESC
  )
}

const extractPlainText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractPlainText).join('')
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null) {
    return extractPlainText(node.props.children)
  }
  return Children.toArray(node).map((child) => extractPlainText(child)).join('')
}

/** 从 react-markdown 渲染的 table 子节点识别步骤 1 穿透表 */
export const getEpcDiscoveryTableClassName = (children: ReactNode): string | undefined => {
  const headers: string[] = []
  Children.forEach(children, (section) => {
    if (!isValidElement<{ children?: ReactNode }>(section)) {
      return
    }
    const tag = typeof section.type === 'string' ? section.type : ''
    if (tag !== 'thead') {
      return
    }
    Children.forEach(section.props.children, (row) => {
      if (!isValidElement<{ children?: ReactNode }>(row)) {
        return
      }
      Children.forEach(row.props.children, (cell) => {
        if (isValidElement<{ children?: ReactNode }>(cell)) {
          headers.push(extractPlainText(cell.props.children).trim())
        }
      })
    })
  })
  return isEpcDiscoveryTableHeaderCells(headers) ? EPC_DISCOVERY_TABLE_CLASS : undefined
}

const splitMarkdownTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

const parseMarkdownPipeTable = (tableText: string): { headers: string[]; rows: string[][] } | null => {
  const lines = tableText
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))

  if (lines.length < 2) {
    return null
  }

  const headers = splitMarkdownTableRow(lines[0])
  const separator = lines[1]
  if (!/^\|?[\s:|-]+\|?$/.test(separator)) {
    return null
  }

  const rows = lines.slice(2).map(splitMarkdownTableRow).filter((row) => row.length === headers.length)
  if (rows.length === 0) {
    return null
  }

  return { headers, rows }
}

const markdownTableToDiscoveryHtml = (tableText: string): string | null => {
  const parsed = parseMarkdownPipeTable(tableText)
  if (!parsed || !isEpcDiscoveryTableHeaderCells(parsed.headers)) {
    return null
  }

  const tableRows: EpcDiscoveryTableRow[] = parsed.rows.map((cells) => ({
    fileName: cells[0] ?? '',
    queueLabel: cells[1] ?? '',
    description: cells[2] ?? ''
  }))

  return formatEpcDiscoveryTableHtml(tableRows).join('\n')
}

const STEP1_SECTION_PATTERN =
  /(###\s*步骤\s*1[^\n]*\n)([\s\S]*?)(?=\n###\s*步骤\s*2[\s:：]|$)/

const MARKDOWN_TABLE_IN_STEP1 = /(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/

const HTML_TABLE_WITHOUT_CLASS = /<table(?![^>]*\bepc-discovery-table\b)([^>]*)>[\s\S]*?<\/table>/i

const isEpcWorkflowReportContent = (content: string): boolean =>
  content.includes(EPC_COMMERCIAL_REPORT_TITLE) ||
  content.includes(EPC_WORK5_PAYMENT_REPORT_TITLE) ||
  /###\s*步骤\s*1[^\n]*(?:多层穿透|aligned)/.test(content)

/** 将步骤 1 内的大模型 Markdown 表 / 无 class 的 HTML 表统一为 epc-discovery-table */
export const normalizeEpcStep1DiscoveryTableInContent = (content: string): string => {
  if (!isEpcWorkflowReportContent(content)) {
    return content
  }

  return content.replace(STEP1_SECTION_PATTERN, (_full, heading: string, body: string) => {
    let nextBody = body

    nextBody = nextBody.replace(MARKDOWN_TABLE_IN_STEP1, (tableBlock) => {
      const html = markdownTableToDiscoveryHtml(tableBlock)
      return html ?? tableBlock
    })

    nextBody = nextBody.replace(HTML_TABLE_WITHOUT_CLASS, (tableHtml) => {
      if (!tableHtml.includes(DISCOVERY_HEADER_FILE) || !tableHtml.includes(DISCOVERY_HEADER_QUEUE)) {
        return tableHtml
      }
      return tableHtml.replace('<table', `<table class="${EPC_DISCOVERY_TABLE_CLASS}"`)
    })

    return `${heading}${nextBody}`
  })
}
