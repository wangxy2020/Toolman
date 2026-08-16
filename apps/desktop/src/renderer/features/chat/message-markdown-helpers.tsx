import { useState } from 'react'
import type { CodeStyle } from './message-settings'
import { LOCAL_FILE_LINK_SCHEME } from './sanitize-assistant-markdown'

export function resolveCodeStyle(codeStyle: CodeStyle): Exclude<CodeStyle, 'auto'> {
  return codeStyle === 'auto' ? 'github' : codeStyle
}

export function decodeToolmanLocalPath(href: string): string {
  const raw = href.slice(LOCAL_FILE_LINK_SCHEME.length)
  try {
    return decodeURIComponent(raw).replace(/^[`'"]+|[`'"]+$/g, '').trim()
  } catch {
    return raw.replace(/^[`'"]+|[`'"]+$/g, '').trim()
  }
}

export function resolveLocalOfficePath(href: string): string | null {
  if (href.startsWith(LOCAL_FILE_LINK_SCHEME)) {
    const decoded = decodeToolmanLocalPath(href)
    if (!decoded) return null
    if (/^\/[^?\#]*\.(?:xlsx?|csv|docx?|pdf)$/i.test(decoded)) return decoded
    if (/^[A-Za-z]:\\[^?\#]*\.(?:xlsx?|csv|docx?|pdf)$/i.test(decoded)) return decoded
    return null
  }

  if (href.startsWith('file://')) {
    try {
      const decoded = decodeURI(href.replace(/^file:\/\//i, ''))
      if (/\.(?:xlsx?|csv|docx?|pdf)$/i.test(decoded)) return decoded
    } catch {
      return null
    }
  }

  const localhostMatch = href.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(.+\.(?:docx|xlsx?)(?:[?#].*)?)$/i,
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

  if (/^\/[^?\#]*\.(?:xlsx?|csv|docx?|pdf)$/i.test(decoded)) return decoded
  if (/^[A-Za-z]:\\[^?\#]*\.(?:xlsx?|csv|docx?|pdf)$/i.test(decoded)) return decoded

  return null
}

export function isLocalhostDevServerHref(href: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$|\?|#)/i.test(href)
}

export function isNonNavigableOfficeHref(href: string, label: string): boolean {
  if (isLocalhostDevServerHref(href)) return true
  if (/^[^/\\]+\.(?:docx|xlsx?)$/i.test(href.trim())) return true
  if (/^[^/\\]+\.(?:docx|xlsx?)$/i.test(label.trim()) && !/^https?:\/\//i.test(href)) return true
  return false
}

export function MessageMarkdownCodeBlock({
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
