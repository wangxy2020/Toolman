import { memo } from 'react'
import type { TranslationLayoutBlock } from './translation-layout-blocks'

interface Props {
  blocks: TranslationLayoutBlock[]
  preferTranslated?: boolean
}

/**
 * Absolute-position translated (or source) text using normalized page bboxes.
 * Used when parse snapshots carry layout geometry; otherwise callers keep
 * structured reading layout.
 */
export const TranslationLayoutPreservePane = memo(function TranslationLayoutPreservePane({
  blocks,
  preferTranslated = true,
}: Props) {
  return (
    <div className="tm-translation-doc-layout-pane" aria-label="layout-preserve">
      {blocks.map((block) => {
        const text = (
          preferTranslated && block.translatedText?.trim()
            ? block.translatedText
            : block.sourceText
        ).trim()
        if (!text) return null
        const { x, y, w, h } = block.bbox
        return (
          <div
            key={block.id}
            className={`tm-translation-doc-layout-block tm-translation-doc-layout-block--${block.kind}`}
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
})
