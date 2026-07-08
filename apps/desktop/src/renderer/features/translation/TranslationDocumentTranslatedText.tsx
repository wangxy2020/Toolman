import { splitTranslationDisplayParagraphs } from './translation-paragraphs'

interface Props {
  text: string
}

export function TranslationDocumentTranslatedText({ text }: Props) {
  const paragraphs = splitTranslationDisplayParagraphs(text)

  return (
    <div className="tm-translation-doc-page-card-text">
      {paragraphs.map((part, index) => (
        <p key={index} className="tm-translation-doc-page-para">
          {part}
        </p>
      ))}
    </div>
  )
}
