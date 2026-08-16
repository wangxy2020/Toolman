import { formatModelDisplayLabel } from '../chat/model-utils'
import type { Provider } from '@toolman/shared'

export function buildTranslationPageStatusFallback(options: {
  t: (key: string, vars?: Record<string, string>) => string
  error: string | null
  setError: (v: string | null) => void
  documentError: string | null
  setDocumentError: (v: string | null) => void
  saveHint: string | null
  isDocuments: boolean
  documentParsing: boolean
  documentParseProgress: { completed: number; total: number; percent: number } | null
  documentBusy: boolean
  translating: boolean
  modelId: string | null
  providers: Provider[]
}) {
  const {
    t, error, setError, documentError, setDocumentError, saveHint, isDocuments,
    documentParsing, documentParseProgress, documentBusy, translating, modelId, providers,
  } = options

  return error
    ? {
        tone: 'error' as const,
        text: error,
        onDismiss: () => setError(null),
      }
    : documentError
      ? {
          tone: 'error' as const,
          text: documentError,
          onDismiss: () => setDocumentError(null),
        }
      : saveHint
        ? { tone: 'info' as const, text: saveHint }
        : isDocuments && documentParsing && documentParseProgress
          ? {
              tone: 'muted' as const,
              text: t('translationPage.documents.parseProgress', {
                percent: String(documentParseProgress.percent),
                completed: String(documentParseProgress.completed),
                total: String(documentParseProgress.total),
              }),
            }
          : isDocuments && documentParsing
          ? { tone: 'muted' as const, text: t('translationPage.documents.parsePreviewRunning') }
          : isDocuments && documentBusy
            ? { tone: 'muted' as const, text: t('translationPage.documents.pageTranslating') }
            : !isDocuments && translating
            ? {
                tone: 'muted' as const,
                text: t('translationPage.workspace.translatingWithModel', {
                  model: formatModelDisplayLabel(modelId, providers) || (modelId ?? ''),
                }),
              }
            : null


}
