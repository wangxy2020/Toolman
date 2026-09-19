import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useI18n } from '../../i18n/useI18n'
import { alignTargetParagraphsToSource } from './translation-align'
import { readContrastParagraphs } from './translation-contrast-dom'
import {
  joinTranslationParagraphs,
  splitContrastParagraphs,
} from './translation-paragraphs'

interface Props {
  sourceText: string
  targetText: string
  modelId: string | null
  onSourceTextChange: (text: string) => void
}

export interface TranslationContrastViewHandle {
  getSourceText: () => string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildParagraphHtml(paragraphs: string[], placeholder?: string): string {
  return paragraphs
    .map((text, index) => {
      const isEmpty = !text
      const placeholderAttr =
        isEmpty && index === 0 && placeholder
          ? ` data-placeholder="${escapeHtml(placeholder)}"`
          : ''
      return `<p data-para-index="${index}" class="tm-translation-contrast-para${
        isEmpty ? ' tm-translation-contrast-para--empty' : ''
      }"${placeholderAttr}>${
        text ? escapeHtml(text).replace(/\n/g, '<br>') : '&nbsp;'
      }</p>`
    })
    .join('')
}

export const TranslationContrastView = forwardRef<TranslationContrastViewHandle, Props>(
  function TranslationContrastView(
    { sourceText, targetText, modelId, onSourceTextChange },
    ref,
  ) {
    const { t } = useI18n()
    const sourceColRef = useRef<HTMLDivElement | null>(null)
    const targetColRef = useRef<HTMLDivElement | null>(null)
    const sourceFocusedRef = useRef(false)
    const lastSyncedSourceRef = useRef(sourceText)
    const sourceParagraphsRef = useRef<string[]>(splitContrastParagraphs(sourceText))
    const [sourceRenderKey, setSourceRenderKey] = useState(0)

    const sourcePlaceholder = t('translationPage.workspace.sourcePlaceholder')

    useImperativeHandle(ref, () => ({
      getSourceText: () => {
        const sourceCol = sourceColRef.current
        if (!sourceCol) return sourceText
        return joinTranslationParagraphs(readContrastParagraphs(sourceCol, sourcePlaceholder))
      },
    }))

    const targetParagraphs = useMemo(() => {
      if (!targetText.trim()) return ['']
      return splitContrastParagraphs(targetText).filter((part) => part.trim())
    }, [targetText])

    // Rebuild left column when source changes externally, or after translation
    // so a pasted single block is split the same way as the target.
    useEffect(() => {
      if (sourceFocusedRef.current) return
      lastSyncedSourceRef.current = sourceText
      sourceParagraphsRef.current = splitContrastParagraphs(sourceText)
      setSourceRenderKey((value) => value + 1)
    }, [sourceText, targetText])

    useLayoutEffect(() => {
      const sourceCol = sourceColRef.current
      if (!sourceCol) return
      sourceCol.innerHTML = buildParagraphHtml(sourceParagraphsRef.current, sourcePlaceholder)
      readContrastParagraphs(sourceCol, sourcePlaceholder)
    }, [sourcePlaceholder, sourceRenderKey])

    useLayoutEffect(() => {
      const sourceCol = sourceColRef.current
      const targetCol = targetColRef.current
      if (!sourceCol || !targetCol) return
      alignTargetParagraphsToSource(sourceCol, targetCol)
    }, [targetParagraphs, sourceRenderKey])

    useEffect(() => {
      const sourceCol = sourceColRef.current
      const targetCol = targetColRef.current
      if (!sourceCol || !targetCol) return

      const observer = new ResizeObserver(() => {
        alignTargetParagraphsToSource(sourceCol, targetCol)
      })
      observer.observe(sourceCol)
      observer.observe(targetCol)
      return () => observer.disconnect()
    }, [targetParagraphs, sourceRenderKey])

    const showTargetPlaceholder = !targetText.trim()
    const placeholderText = modelId
      ? t('translationPage.workspace.targetPlaceholder')
      : t('translationPage.workspace.noModel')

    return (
      <div className="tm-translation-contrast">
        <div className="tm-translation-contrast-columns">
          <section className="tm-translation-contrast-pane">
            <div
              key={`source-${sourceRenderKey}`}
              ref={sourceColRef}
              className="tm-translation-contrast-col tm-translation-contrast-col--source"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={t('translationPage.workspace.sourceLabel')}
              onFocus={() => {
                sourceFocusedRef.current = true
              }}
              onBlur={() => {
                sourceFocusedRef.current = false
                const sourceCol = sourceColRef.current
                if (!sourceCol) return
                const next = joinTranslationParagraphs(
                  readContrastParagraphs(sourceCol, sourcePlaceholder),
                )
                lastSyncedSourceRef.current = next
                sourceParagraphsRef.current = splitContrastParagraphs(next)
                onSourceTextChange(next)
                setSourceRenderKey((value) => value + 1)
              }}
              onInput={() => {
                const sourceCol = sourceColRef.current
                const targetCol = targetColRef.current
                if (!sourceCol) return
                const next = joinTranslationParagraphs(
                  readContrastParagraphs(sourceCol, sourcePlaceholder),
                )
                lastSyncedSourceRef.current = next
                onSourceTextChange(next)
                if (targetCol) alignTargetParagraphsToSource(sourceCol, targetCol)
              }}
            />
          </section>

          <div className="tm-translation-contrast-divider" aria-hidden="true" />

          <section className="tm-translation-contrast-pane">
            <div
              ref={targetColRef}
              className="tm-translation-contrast-col tm-translation-contrast-col--target"
              aria-label={t('translationPage.workspace.targetLabel')}
            >
              {targetParagraphs.map((paragraph, index) => (
                  <p
                    key={`target-${index}`}
                    data-para-index={index}
                    className={[
                      'tm-translation-contrast-para',
                      showTargetPlaceholder && index === 0
                        ? 'tm-translation-contrast-para--placeholder'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {showTargetPlaceholder
                      ? placeholderText
                      : paragraph || '\u00a0'}
                  </p>
                ))}
            </div>
          </section>
        </div>
      </div>
    )
  },
)
