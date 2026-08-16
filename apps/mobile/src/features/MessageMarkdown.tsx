import { Text, View } from 'react-native'
import { parseBlocks, renderInline } from './messageMarkdownParse'
import { noteStyles, styles } from './messageMarkdownStyles'

type Props = {
  text: string
  align?: 'left' | 'right'
  /** `note` matches desktop `.tm-notes-editor-body` (16px / 1.7). */
  variant?: 'chat' | 'note'
}

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
