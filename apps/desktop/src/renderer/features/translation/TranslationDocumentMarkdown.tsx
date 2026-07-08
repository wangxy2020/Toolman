import { MessageMarkdown } from '../chat/MessageMarkdown'
import { DEFAULT_MESSAGE_SETTINGS } from '../chat/message-settings'

interface Props {
  text: string
}

export function TranslationDocumentMarkdown({ text }: Props) {
  if (!text.trim()) return null

  return (
    <div className="tm-translation-doc-markdown">
      <MessageMarkdown text={text} settings={DEFAULT_MESSAGE_SETTINGS} />
    </div>
  )
}
