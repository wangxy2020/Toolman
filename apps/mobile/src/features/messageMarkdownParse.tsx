import { Fragment, type ReactNode } from 'react'
import { Text } from 'react-native'
import { styles } from './messageMarkdownStyles'

type ListItem = { marker: string; text: string }

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; items: ListItem[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }

/**
 * Lightweight Markdown renderer for chat bubbles (RN + web).
 * Covers the common assistant patterns: headings, lists, bold, code.
 */
export function parseBlocks(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (/^\s*```/.test(line)) {
      const indent = line.match(/^\s*/)?.[0].length ?? 0
      const lang = line.trim().slice(3).trim()
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) {
        const raw = lines[i] ?? ''
        body.push(raw.startsWith(' '.repeat(indent)) ? raw.slice(indent) : raw.trimStart())
        i += 1
      }
      if (i < lines.length) i += 1
      if (!/^socratic-(?:card|state)$/i.test(lang)) {
        blocks.push({ type: 'code', lang, text: body.join('\n') })
      }
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      })
      i += 1
      continue
    }

    const unordered = /^\s*[-*+]\s+/.test(line)
    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      const items: ListItem[] = []
      const isOrdered = Boolean(ordered)
      const start = isOrdered ? Number(ordered![1]) : 1
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (isOrdered) {
          const o = /^\s*(\d+)[.)]\s+(.+)$/.exec(current)
          if (!o) break
          items.push({ marker: `${start + items.length}.`, text: o[2]!.trim() })
          i += 1
          continue
        }
        const task = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(current)
        if (task) {
          items.push({
            marker: task[1]!.toLowerCase() === 'x' ? '☑' : '☐',
            text: (task[2] ?? '').trim(),
          })
          i += 1
          continue
        }
        const u = /^\s*[-*+]\s+(.+)$/.exec(current)
        if (!u) break
        items.push({ marker: '•', text: u[1]!.trim() })
        i += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? '')) {
        quoteLines.push((lines[i] ?? '').replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') })
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    const para: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (
        !next.trim() ||
        /^```/.test(next) ||
        /^(#{1,3})\s+/.test(next) ||
        /^\s*[-*+]\s+/.test(next) ||
        /^\s*\d+[.)]\s+/.test(next) ||
        /^\s*>\s?/.test(next) ||
        /^\s*([-*_])\1{2,}\s*$/.test(next)
      ) {
        break
      }
      para.push(next)
      i += 1
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') })
  }

  return blocks
}

export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|`[^`\n]+?`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|\*[^*\n]+?\*|_[^_\n]+?_)/g
  let last = 0
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${idx++}`}>{text.slice(last, match.index)}</Fragment>,
      )
    }
    const token = match[0]!
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      nodes.push(
        <Text key={`${keyPrefix}-b-${idx++}`} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>,
      )
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <Text key={`${keyPrefix}-s-${idx++}`} style={styles.strike}>
          {token.slice(2, -2)}
        </Text>,
      )
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <Text key={`${keyPrefix}-c-${idx++}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>,
      )
    } else if (token.startsWith('![')) {
      const alt = token.match(/^!\[([^\]]*)\]/)?.[1] ?? ''
      if (alt) {
        nodes.push(<Fragment key={`${keyPrefix}-img-${idx++}`}>{alt}</Fragment>)
      }
    } else if (token.startsWith('[[') && token.endsWith(']]')) {
      const inner = token.slice(2, -2)
      const label = inner.split('|')[1]?.trim() || inner.split('|')[0]?.trim() || inner
      nodes.push(
        <Text key={`${keyPrefix}-w-${idx++}`} style={styles.link}>
          {label}
        </Text>,
      )
    } else if (token.startsWith('[') && token.includes('](')) {
      const label = token.match(/^\[([^\]]+)\]/)?.[1] ?? token
      nodes.push(
        <Text key={`${keyPrefix}-a-${idx++}`} style={styles.link}>
          {label}
        </Text>,
      )
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <Text key={`${keyPrefix}-i-${idx++}`} style={styles.italic}>
          {token.slice(1, -1)}
        </Text>,
      )
    } else {
      nodes.push(<Fragment key={`${keyPrefix}-r-${idx++}`}>{token}</Fragment>)
    }
    last = match.index + token.length
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${idx++}`}>{text.slice(last)}</Fragment>)
  }

  return nodes.length > 0 ? nodes : [text]
}

