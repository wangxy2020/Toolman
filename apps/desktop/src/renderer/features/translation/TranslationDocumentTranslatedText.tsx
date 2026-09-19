import { memo } from 'react'
import {
  buildTranslationDisplayBlocks,
  isNumericDisplayCell,
  isTotalDisplayRow,
} from './translation-display-blocks'

interface Props {
  text: string
}

export const TranslationDocumentTranslatedText = memo(function TranslationDocumentTranslatedText({
  text,
}: Props) {
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
          return (
            <h3 key={index} className="tm-translation-doc-page-heading">
              {block.text}
            </h3>
          )
        }
        if (block.type === 'meta') {
          return (
            <p key={index} className="tm-translation-doc-page-meta">
              {block.text}
            </p>
          )
        }
        return (
          <p key={index} className="tm-translation-doc-page-para">
            {block.text}
          </p>
        )
      })}
    </div>
  )
})
