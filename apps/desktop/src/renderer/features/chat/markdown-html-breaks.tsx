import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'

export const MARKDOWN_HTML_BR_RE = /<br\s*\/?>/gi

/** Outside GFM tables, convert model-emitted <br> to markdown hard breaks. */
export function normalizeMarkdownHtmlLineBreaksOutsideTables(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*\|.*\|\s*$/.test(line)) return line
      return line.replace(MARKDOWN_HTML_BR_RE, '  \n')
    })
    .join('\n')
}

/** Streaming: normalize <br> in table rows to inline separators; elsewhere use hard breaks. */
export function normalizeStreamingHtmlLineBreaks(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        return line.replace(MARKDOWN_HTML_BR_RE, ' · ')
      }
      return line.replace(MARKDOWN_HTML_BR_RE, '  \n')
    })
    .join('\n')
}

function renderTextWithHtmlBreaks(text: string, keyPrefix: string): ReactNode {
  MARKDOWN_HTML_BR_RE.lastIndex = 0
  if (!MARKDOWN_HTML_BR_RE.test(text)) return text

  MARKDOWN_HTML_BR_RE.lastIndex = 0
  const parts = text.split(MARKDOWN_HTML_BR_RE)
  if (parts.length <= 1) return text

  return parts.map((part, index) => (
    <Fragment key={`${keyPrefix}-${index}`}>
      {index > 0 ? <br /> : null}
      {part}
    </Fragment>
  ))
}

function renderNodeWithHtmlBreaks(node: ReactNode, keyPrefix: string): ReactNode {
  if (typeof node === 'string') return renderTextWithHtmlBreaks(node, keyPrefix)
  if (typeof node === 'number') return node
  if (node == null || typeof node === 'boolean') return node

  if (Array.isArray(node)) {
    return node.map((child, index) => renderNodeWithHtmlBreaks(child, `${keyPrefix}-${index}`))
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const mappedChildren = renderNodeWithHtmlBreaks(node.props.children, keyPrefix)
    if (mappedChildren === node.props.children) return node
    return cloneElement(node as ReactElement<{ children?: ReactNode }>, {
      children: mappedChildren,
    })
  }

  return node
}

/** Render literal <br> tags inside markdown table cells as line breaks. */
export function renderMarkdownHtmlBreaks(children: ReactNode): ReactNode {
  return Children.map(children, (child, index) =>
    renderNodeWithHtmlBreaks(child, String(index)),
  )
}
