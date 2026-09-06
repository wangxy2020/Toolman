import { memo } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { hasHtmlMarkup, sanitizeDocumentPreviewHtml } from './translation-page-source-quality'

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

  if (hasHtmlMarkup(text)) {
    return (
      <div
        className="tm-translation-doc-markdown"
        dangerouslySetInnerHTML={{ __html: sanitizeDocumentPreviewHtml(text) }}
      />
    )
  }

  return (
    <div className="tm-translation-doc-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
