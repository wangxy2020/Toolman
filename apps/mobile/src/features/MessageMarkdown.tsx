import { Fragment, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

type Props = {
  text: string
  align?: 'left' | 'right'
  /** `note` matches desktop `.tm-notes-editor-body` (16px / 1.7). */
  variant?: 'chat' | 'note'
}

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
export function MessageMarkdown({ text, align = 'left', variant = 'chat' }: Props) {
  const source = text.replace(/\r\n/g, '\n').trimEnd()
  if (!source.trim()) return null

  const blocks = parseBlocks(source)
  const alignStyle = align === 'right' ? styles.alignRight : null
  const s = variant === 'note' ? noteStyles : styles
  const selectable = variant === 'note'

  return (
    <View style={s.root}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`
        switch (block.type) {
          case 'heading':
            return (
              <Text
                key={key}
                selectable={selectable}
                style={[
                  s.paragraph,
                  block.level === 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3,
                  alignStyle,
                ]}
              >
                {renderInline(block.text, key)}
              </Text>
            )
          case 'list':
            return (
              <View key={key} style={s.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={`${key}-${itemIndex}`} style={s.listItem}>
                    <Text selectable={selectable} style={s.listBullet}>
                      {item.marker}
                    </Text>
                    <Text
                      selectable={selectable}
                      style={[s.paragraph, s.listText, alignStyle]}
                    >
                      {renderInline(item.text, `${key}-${itemIndex}`)}
                    </Text>
                  </View>
                ))}
              </View>
            )
          case 'code':
            return (
              <View key={key} style={s.codeBlock}>
                {block.lang ? <Text style={s.codeLang}>{block.lang}</Text> : null}
                <Text selectable={selectable} style={s.codeText}>
                  {block.text}
                </Text>
              </View>
            )
          case 'quote':
            return (
              <View key={key} style={s.quote}>
                <Text selectable={selectable} style={[s.paragraph, s.quoteText, alignStyle]}>
                  {renderInline(block.text, key)}
                </Text>
              </View>
            )
          case 'hr':
            return <View key={key} style={s.hr} />
          case 'paragraph':
          default:
            return (
              <Text key={key} selectable={selectable} style={[s.paragraph, alignStyle]}>
                {renderInline(block.text, key)}
              </Text>
            )
        }
      })}
    </View>
  )
}

function parseBlocks(source: string): Block[] {
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

function renderInline(text: string, keyPrefix: string): ReactNode[] {
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

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  },
  alignRight: {
    textAlign: 'right',
  },
  h1: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginTop: 2,
  },
  h2: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 2,
  },
  h3: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: colors.text,
  },
  italic: {
    fontStyle: 'italic',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  link: {
    color: colors.accent,
  },
  inlineCode: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    backgroundColor: colors.inputBg,
    color: colors.text,
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listBullet: {
    width: 22,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  codeLang: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  codeText: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 6,
    paddingVertical: 6,
    paddingRight: 8,
  },
  quoteText: {
    color: colors.text,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
})

/** Desktop `.tm-notes-editor-body`: 16px, line-height 1.7; headings from `.tm-notes-rich-body`. */
const noteStyles = StyleSheet.create({
  root: {
    gap: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 27,
    color: colors.text,
  },
  h1: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 44,
    marginTop: 10,
    marginBottom: 6,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 37,
    marginTop: 9,
    marginBottom: 5,
  },
  h3: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 31,
    marginTop: 8,
    marginBottom: 4,
  },
  list: {
    gap: 6,
    marginVertical: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listBullet: {
    width: 22,
    fontSize: 16,
    lineHeight: 27,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    marginVertical: 4,
  },
  codeLang: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  codeText: {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 15,
    lineHeight: 25,
    color: colors.text,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    paddingVertical: 2,
    marginVertical: 4,
  },
  quoteText: {
    color: colors.textSecondary,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
})
