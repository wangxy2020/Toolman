import { Fragment, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

type Props = {
  text: string
  align?: 'left' | 'right'
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }

/**
 * Lightweight Markdown renderer for chat bubbles (RN + web).
 * Covers the common assistant patterns: headings, lists, bold, code.
 */
export function MessageMarkdown({ text, align = 'left' }: Props) {
  const source = text.replace(/\r\n/g, '\n').trimEnd()
  if (!source.trim()) return null

  const blocks = parseBlocks(source)
  const alignStyle = align === 'right' ? styles.alignRight : null

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`
        switch (block.type) {
          case 'heading':
            return (
              <Text
                key={key}
                style={[
                  styles.paragraph,
                  block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3,
                  alignStyle,
                ]}
              >
                {renderInline(block.text, key)}
              </Text>
            )
          case 'list':
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={`${key}-${itemIndex}`} style={styles.listItem}>
                    <Text style={styles.listBullet}>
                      {block.ordered ? `${itemIndex + 1}.` : '•'}
                    </Text>
                    <Text style={[styles.paragraph, styles.listText, alignStyle]}>
                      {renderInline(item, `${key}-${itemIndex}`)}
                    </Text>
                  </View>
                ))}
              </View>
            )
          case 'code':
            return (
              <View key={key} style={styles.codeBlock}>
                {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
                <Text style={styles.codeText}>{block.text}</Text>
              </View>
            )
          case 'quote':
            return (
              <View key={key} style={styles.quote}>
                <Text style={[styles.paragraph, styles.quoteText, alignStyle]}>
                  {renderInline(block.text, key)}
                </Text>
              </View>
            )
          case 'hr':
            return <View key={key} style={styles.hr} />
          case 'paragraph':
          default:
            return (
              <Text key={key} style={[styles.paragraph, alignStyle]}>
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

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push({ type: 'code', lang, text: body.join('\n') })
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

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      const items: string[] = []
      const isOrdered = Boolean(ordered)
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const u = /^\s*[-*+]\s+(.+)$/.exec(current)
        const o = /^\s*\d+[.)]\s+(.+)$/.exec(current)
        if (isOrdered ? o : u) {
          items.push((isOrdered ? o![1]! : u![1]!).trim())
          i += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered: isOrdered, items })
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
    /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|\*[^*\n]+?\*|_[^_\n]+?_)/g
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
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <Text key={`${keyPrefix}-c-${idx++}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
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
    width: 18,
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
