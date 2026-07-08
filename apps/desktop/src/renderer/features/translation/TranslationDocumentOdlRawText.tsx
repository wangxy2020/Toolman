interface Props {
  text: string
}

/** Parse preview: show ODL output verbatim (no markdown / paragraph layout). */
export function TranslationDocumentOdlRawText({ text }: Props) {
  if (!text) return null

  return (
    <pre className="tm-translation-doc-odl-raw">{text}</pre>
  )
}
