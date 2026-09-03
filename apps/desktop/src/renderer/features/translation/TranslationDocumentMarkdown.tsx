import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  text: string
}

/** Lightweight parse preview — full chat markdown/math would stall the left PDF. */
export function TranslationDocumentMarkdown({ text }: Props) {
  if (!text.trim()) return null

  return (
    <div className="tm-translation-doc-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
