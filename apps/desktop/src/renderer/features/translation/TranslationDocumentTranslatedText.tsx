import { memo } from 'react'
import {
  buildTranslationDisplayBlocks,
  isNumericDisplayCell,
  isTotalDisplayRow,
} from './translation-display-blocks'
import { TranslationDocumentMarkdown } from './TranslationDocumentMarkdown'
import { hasHtmlMarkup } from './translation-page-source-quality'

interface Props {
  text: string
}

/**
 * Dual-pane body renderer shared by parse preview and Chinese translate.
 * Prefer heading / paragraph / table blocks (same as translate). Only use the
 * HTML markdown path when the page already has a real <table>.
 */
export const TranslationDocumentTranslatedText = memo(function TranslationDocumentTranslatedText({
  text,
}: Props) {
  // Structure-aware HTML tables (ODL or prior HTML cache) keep the markdown path.
  // Pipe / GFM / plain prose must NOT go through GFM→HTML — that mixed letter
  // paragraphs into table cells. Translate already layouts correctly via blocks.
  if (hasHtmlMarkup(text) && /<table\b/i.test(text)) {
    return <TranslationDocumentMarkdown text={text} />
  }
  if (hasHtmlMarkup(text)) {
    return <TranslationDocumentMarkdown text={text} />
  }

  const blocks = buildTranslationDisplayBlocks(text)

  return (
    <div className="tm-translation-doc-page-card-text">
      {blocks.map((block, index) => {
        if (block.type === 'table') {
          return (
            <div key={index} className="tm-translation-doc-table-wrap">
              <table className="tm-translation-doc-table tm-translation-doc-table--flow">
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className={
                          isNumericDisplayCell(cell) ? 'tm-translation-doc-table-cell--num' : undefined
                        }
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className={isTotalDisplayRow(row) ? 'tm-translation-doc-table-row--total' : undefined}
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={
                            isNumericDisplayCell(cell) ? 'tm-translation-doc-table-cell--num' : undefined
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'heading') {
          const heading = block.text.replace(/^#+\s+/, '').trim()
          return (
            <h3 key={index} className="tm-translation-doc-page-heading">
              {heading}
            </h3>
          )
        }
        if (block.type === 'meta') {
          return (
            <p key={index} className="tm-translation-doc-page-meta">
              {block.text.trim()}
            </p>
          )
        }
        return (
          <p key={index} className="tm-translation-doc-page-para">
            {block.text.replace(/^#+\s+/, '').trim()}
          </p>
        )
      })}
    </div>
  )
})
