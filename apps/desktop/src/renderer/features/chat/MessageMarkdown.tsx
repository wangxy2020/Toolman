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
import { sanitizeAssistantMarkdown } from './sanitize-assistant-markdown'
import { normalizeMarkdownHtmlLineBreaksOutsideTables } from './markdown-html-breaks'
import { prepareStreamingMarkdown } from './streaming-markdown'
import type { CodeStyle, MessageSettings } from './message-settings'
import { presentPmPlanMarkdownForDisplay } from '@toolman/shared'
import { usePlanProjectDisplayName } from './PlanProjectDisplayNameContext'
import {
  isLocalhostDevServerHref,
  isNonNavigableOfficeHref,
  MessageMarkdownCodeBlock,
  resolveCodeStyle,
  resolveLocalOfficePath,
} from './message-markdown-helpers'
import 'katex/dist/katex.min.css'

const CODE_THEME_PATHS: Record<Exclude<CodeStyle, 'auto'>, () => Promise<unknown>> = {
  github: () => import('highlight.js/styles/github.css'),
  monokai: () => import('highlight.js/styles/monokai.css'),
  vs: () => import('highlight.js/styles/vs2015.css'),
}

interface Props {
  text: string
  settings: MessageSettings
  sanitizeAssistant?: boolean
  streaming?: boolean
}

export function MessageMarkdown({
  text,
  settings,
  sanitizeAssistant = false,
  streaming = false,
}: Props) {
  const [themeReady, setThemeReady] = useState(false)
  const codeStyle = resolveCodeStyle(settings.codeStyle)
  const planProjectName = usePlanProjectDisplayName()
  const renderedText = useMemo(() => {
    const present = (value: string) =>
      presentPmPlanMarkdownForDisplay(value, {
        ...(planProjectName ? { fallbackProjectName: planProjectName } : {}),
      })
    if (streaming) {
      return present(prepareStreamingMarkdown(text, sanitizeAssistant))
    }
    const base = sanitizeAssistant ? sanitizeAssistantMarkdown(text) : text
    return normalizeMarkdownHtmlLineBreaksOutsideTables(present(base))
  }, [planProjectName, sanitizeAssistant, streaming, text])

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
          <MessageMarkdownCodeBlock
            className={className}
            fancy={settings.fancyCodeBlocks}
            collapsible={settings.collapsibleCodeBlocks}
            showLineNumbers={settings.showLineNumbers}
            wrap={settings.wrapCodeBlocks}
          >
            {children}
          </MessageMarkdownCodeBlock>
        )
      },
      a({ href, children, ...props }) {
        if (href) {
          const localPath = resolveLocalOfficePath(href)
          if (localPath) {
            return <LocalFilePathLink path={localPath} action="open" />
          }

          const label = String(children ?? '')
          if (isNonNavigableOfficeHref(href, label)) {
            return (
              <span className="tm-md-docx-filename" title="请使用消息下方「打开文件」">
                {children}
              </span>
            )
          }

          if (/\.(?:docx|xlsx?)(?:[?#]|$)/i.test(href)) {
            return <span className="tm-md-docx-filename">{children}</span>
          }
        }

        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            {...props}
            onClick={(event) => {
              if (href && isLocalhostDevServerHref(href)) {
                event.preventDefault()
              }
            }}
          >
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
        streaming ? 'tm-md--streaming' : '',
        settings.messageStyle === 'concise' ? 'tm-md--concise' : '',
        settings.messageStyle === 'detailed' ? 'tm-md--detailed' : '',
        themeReady || streaming ? 'tm-md--themed' : '',
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
