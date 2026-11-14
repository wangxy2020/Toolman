import type { DocumentPageState } from './document-page-types'
import {
  hasVisibleParsePreviewBody,
  resolveDocumentPageDisplayText,
  usesDocumentPageTableFit,
  usesRichDocumentPagePreview,
} from './translation-page-source-quality'
import { looksLikeTranslationTable } from './translation-display-table'

export type DocumentPageCardMode = 'parse' | 'translate' | 'idle'

export function resolveDocumentPageCardMode(
  parseArmed: boolean,
  translationArmed: boolean,
): DocumentPageCardMode {
  // Translate wins when both are somehow set — never keep parse preview on top of Chinese.
  if (translationArmed) return 'translate'
  if (parseArmed) return 'parse'
  return 'idle'
}

export function resolveDocumentPageCardView(
  page: DocumentPageState,
  mode: DocumentPageCardMode,
  heavyContent: boolean,
): {
  displayText: string
  showRich: boolean
  fitTable: boolean
  isTranslated: boolean
  isTranslating: boolean
} {
  const isTranslating =
    page.status === 'translating' || page.status === 'loading-source'
  const chinese = page.translatedText.trim()
  const parsePreview = page.parsedMarkdown?.trim() || ''
  const sourceText = page.sourceText.trim()

  // Translate mode / finished page (when not explicitly viewing parse): show Chinese.
  const showChinese =
    Boolean(chinese) &&
    page.status === 'done' &&
    mode !== 'parse'

  if (showChinese) {
    return {
      displayText: chinese,
      showRich: false,
      fitTable: looksLikeTranslationTable(chinese),
      isTranslated: true,
      isTranslating: false,
    }
  }

  // Parse preview uses the same plain/pipe text translate layouts from — not the
  // old GFM→HTML cache that put letter paragraphs into <td>.
  const previewRaw =
    mode === 'parse'
      ? (parsePreview || chinese || sourceText).trim()
      : (parsePreview || chinese).trim()
  const hasPreview = hasVisibleParsePreviewBody(chinese, parsePreview || sourceText || undefined)
  const previewMode =
    hasPreview &&
    (page.status === 'parsed' ||
      page.status === 'parsing' ||
      isTranslating ||
      page.status === 'idle' ||
      page.status === 'done' ||
      mode === 'parse')

  if (!previewMode || !previewRaw) {
    return {
      displayText: chinese,
      showRich: false,
      fitTable: false,
      isTranslated: false,
      isTranslating,
    }
  }

  // Only ODL HTML <table> pages use the rich markdown path. Pipe/GFM parse
  // pages share TranslationDocumentTranslatedText block layout with Chinese.
  const hasHtmlTable = /<table\b/i.test(previewRaw)
  const showRich = hasHtmlTable && (heavyContent || usesRichDocumentPagePreview(previewRaw))
  const displayText =
    hasHtmlTable && heavyContent
      ? resolveDocumentPageDisplayText(previewRaw, showRich)
      : previewRaw
  const fitTable =
    looksLikeTranslationTable(displayText) ||
    usesDocumentPageTableFit(displayText) ||
    (hasHtmlTable && usesDocumentPageTableFit(previewRaw))

  return {
    displayText,
    showRich,
    fitTable,
    isTranslated: false,
    isTranslating,
  }
}
