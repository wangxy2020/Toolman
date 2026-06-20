import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import type { Components } from 'react-markdown'
import type { Pluggable } from 'unified'
import {
  MarkdownTable,
  MarkdownTableDataCell,
  MarkdownTableHeaderCell,
  MarkdownTableRow,
} from './md-table-alignment'
import { LocalFilePathLink } from './LocalFilePathLink'
import { LOCAL_FILE_LINK_SCHEME, sanitizeAssistantMarkdown } from './sanitize-assistant-markdown'
import type { CodeStyle, MessageSettings } from './message-settings'
import 'katex/dist/katex.min.css'

const CODE_THEME_PATHS: Record<Exclude<CodeStyle, 'auto'>, () => Promise<unknown>> = {
  github: () => import('highlight.js/styles/github.css'),
  monokai: () => import('highlight.js/styles/monokai.css'),
  vs: () => import('highlight.js/styles/vs2015.css'),
}

function resolveCodeStyle(codeStyle: CodeStyle): Exclude<CodeStyle, 'auto'> {
  return codeStyle === 'auto' ? 'github' : codeStyle
}

function resolveLocalDocxPath(href: string): string | null {
  if (href.startsWith(LOCAL_FILE_LINK_SCHEME)) {
    try {
      return decodeURIComponent(href.slice(LOCAL_FILE_LINK_SCHEME.length))
    } catch {
      return href.slice(LOCAL_FILE_LINK_SCHEME.length)
    }
  }

  if (href.startsWith('file://')) {
    try {
      return decodeURI(href.replace(/^file:\/\//i, ''))
    } catch {
      return null
    }
  }

  const localhostMatch = href.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(.+\.docx(?:[?#].*)?)$/i,
  )
  if (localhostMatch) {
    try {
      return decodeURIComponent(localhostMatch[1].replace(/[?#].*$/, ''))
    } catch {
      return localhostMatch[1].replace(/[?#].*$/, '')
    }
  }

  let decoded = href
  try {
    decoded = decodeURIComponent(href)
  } catch {
    decoded = href
  }

  if (/^\/[^?\#]*\.docx$/i.test(decoded)) return decoded
  if (/^[A-Za-z]:\\[^?\#]*\.docx$/i.test(decoded)) return decoded
  return null
}

function CodeBlock({
  className,
  children,
  fancy,
  collapsible,
  showLineNumbers,
  wrap,
}: {
  className?: string
  children: React.ReactNode
  fancy: boolean
  collapsible: boolean
  showLineNumbers: boolean
  wrap: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const language = className?.replace('language-', '') ?? 'text'
  const text = String(children).replace(/\n$/, '')
  const lines = text.split('\n')

  const body = (
    <pre
      className={[
        'tm-md-pre',
        fancy ? 'tm-md-pre--fancy' : '',
        wrap ? 'tm-md-pre--wrap' : '',
        showLineNumbers ? 'tm-md-pre--line-numbers' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <code className={className}>
        {showLineNumbers
          ? lines.map((line, index) => (
              <span key={`${index}-${line}`} className="tm-md-code-line">
                <span className="tm-md-line-number">{index + 1}</span>
                <span className="tm-md-line-text">{line || ' '}</span>
              </span>
            ))
          : children}
      </code>
    </pre>
  )

  if (!collapsible) return body

  return (
    <div className={`tm-md-code-block ${collapsed ? 'tm-md-code-block--collapsed' : ''}`}>
      <button
        type="button"
        className="tm-md-code-head"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="tm-md-code-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="tm-md-code-lang">{language}</span>
      </button>
      {!collapsed ? body : null}
    </div>
  )
}

interface Props {
  text: string
  settings: MessageSettings
  sanitizeAssistant?: boolean
}

export function MessageMarkdown({ text, settings, sanitizeAssistant = false }: Props) {
  const [themeReady, setThemeReady] = useState(false)
  const codeStyle = resolveCodeStyle(settings.codeStyle)
  const renderedText = useMemo(
    () => (sanitizeAssistant ? sanitizeAssistantMarkdown(text) : text),
    [sanitizeAssistant, text],
  )

  useEffect(() => {
    let cancelled = false
    setThemeReady(false)
    void CODE_THEME_PATHS[codeStyle]().then(() => {
      if (!cancelled) setThemeReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [codeStyle])

  const remarkPlugins = useMemo((): Pluggable[] =>
      settings.mathEngine === 'katex'
        ? [remarkGfm, [remarkMath, { singleDollarTextMath: settings.enableInlineDollar }]]
        : [remarkGfm],
    [settings.mathEngine, settings.enableInlineDollar],
  )

  const rehypePlugins = useMemo(
    () =>
      settings.mathEngine === 'katex'
        ? [rehypeHighlight, rehypeKatex]
        : [rehypeHighlight],
    [settings.mathEngine],
  )

  const components = useMemo<Components>(
    () => ({
      pre({ children }) {
        return <>{children}</>
      },
      code({ className, children, ...props }) {
        const isBlock = Boolean(className)
        if (!isBlock) {
          return (
            <code className="tm-md-inline-code" {...props}>
              {children}
            </code>
          )
        }

        return (
          <CodeBlock
            className={className}
            fancy={settings.fancyCodeBlocks}
            collapsible={settings.collapsibleCodeBlocks}
            showLineNumbers={settings.showLineNumbers}
            wrap={settings.wrapCodeBlocks}
          >
            {children}
          </CodeBlock>
        )
      },
      a({ href, children, ...props }) {
        if (href) {
          const localPath = resolveLocalDocxPath(href)
          if (localPath) {
            return <LocalFilePathLink path={localPath} action="open" />
          }

          if (/\.docx(?:[?#]|$)/i.test(href)) {
            return <span className="tm-md-docx-filename">{children}</span>
          }
        }

        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
            {children}
          </a>
        )
      },
      table({ children, ...props }) {
        return <MarkdownTable {...props}>{children}</MarkdownTable>
      },
      thead({ children, ...props }) {
        return <thead {...props}>{children}</thead>
      },
      tbody({ children, ...props }) {
        return <tbody {...props}>{children}</tbody>
      },
      tr({ children, ...props }) {
        return <MarkdownTableRow {...props}>{children}</MarkdownTableRow>
      },
      th({ children, ...props }) {
        return <MarkdownTableHeaderCell {...props}>{children}</MarkdownTableHeaderCell>
      },
      td({ children, ...props }) {
        return <MarkdownTableDataCell {...props}>{children}</MarkdownTableDataCell>
      },
      hr() {
        return <hr className="tm-md-hr" />
      },
    }),
    [
      settings.collapsibleCodeBlocks,
      settings.fancyCodeBlocks,
      settings.showLineNumbers,
      settings.wrapCodeBlocks,
    ],
  )

  if (!renderedText.trim()) return null

  return (
    <div
      className={[
        'tm-md',
        settings.messageStyle === 'concise' ? 'tm-md--concise' : '',
        settings.messageStyle === 'detailed' ? 'tm-md--detailed' : '',
        themeReady ? 'tm-md--themed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {renderedText}
      </ReactMarkdown>
    </div>
  )
}
