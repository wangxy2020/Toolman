import { memo } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  gfmTablesToHtml,
  hasGfmTableMarkup,
  hasHtmlMarkup,
  repairDocumentPreviewTables,
  sanitizeDocumentPreviewHtml,
} from './translation-page-source-quality'
import { withHtmlTextLineBreaks, withMarkdownHardLineBreaks } from './translation-paragraphs'

interface Props {
  text: string
}

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="tm-translation-doc-table-wrap">
      <table className="tm-translation-doc-table">{children}</table>
    </div>
  ),
}

/** Saved ODL HTML is injected once; GFM markdown uses remark without rehype-raw. */
export const TranslationDocumentMarkdown = memo(function TranslationDocumentMarkdown({ text }: Props) {
  if (!text.trim()) return null

  // Prefer HTML tables (including GFM→HTML) so Contract Data grids use table CSS.
  // Also repair pages that are mostly `|row|` pipes (continuation tables).
  if (hasHtmlMarkup(text) || hasGfmTableMarkup(text) || /^\s*\|.+\|/m.test(text)) {
    const base =
      hasHtmlMarkup(text) && /<table\b/i.test(text)
        ? text
        : hasGfmTableMarkup(text)
          ? gfmTablesToHtml(text)
          : text
    const html = repairDocumentPreviewTables(base)
    return (
      <div
        className="tm-translation-doc-markdown"
        dangerouslySetInnerHTML={{ __html: sanitizeDocumentPreviewHtml(withHtmlTextLineBreaks(html)) }}
      />
    )
  }

  return (
    <div className="tm-translation-doc-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {withMarkdownHardLineBreaks(text)}
      </ReactMarkdown>
    </div>
  )
})
