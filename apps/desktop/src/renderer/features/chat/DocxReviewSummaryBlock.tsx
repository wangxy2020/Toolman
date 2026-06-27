import type { ContentBlock } from '@toolman/shared'

type SummaryBlock = Extract<ContentBlock, { type: 'docx_review_summary' }>

interface Props {
  summary: SummaryBlock
}

function StatRow({
  label,
  requested,
  applied,
  failed,
}: {
  label: string
  requested: number
  applied: number
  failed: number
}) {
  if (requested === 0) return null

  return (
    <div className="tm-docx-review-summary-stat">
      <span className="tm-docx-review-summary-stat-label">{label}</span>
      <span className="tm-docx-review-summary-stat-value">
        {applied}/{requested} 成功
        {failed > 0 ? ` · ${failed} 失败` : ''}
      </span>
    </div>
  )
}

function conversionMethodLabel(method: SummaryBlock['conversionMethod']): string | null {
  switch (method) {
    case 'office-oxide':
      return 'Rust 格式桥转换（office_oxide，保留格式）'
    case 'microsoft-word':
      return 'Microsoft Word 转换（保留格式）'
    case 'libreoffice':
      return 'LibreOffice 转换（保留格式）'
    case 'plaintext':
      return '纯文本转换（目录/格式/大纲已丢失；建议安装 LibreOffice 或上传 .docx）'
    default:
      return null
  }
}

export function DocxReviewSummaryBlock({ summary }: Props) {
  const hasStats =
    summary.commentsRequested > 0 ||
    summary.replacementsRequested > 0 ||
    summary.paragraphEditsRequested > 0
  const conversionLabel = conversionMethodLabel(summary.conversionMethod)

  return (
    <section className="tm-docx-review-summary" aria-label="修订执行统计">
      <h3 className="tm-docx-review-summary-title">修订执行统计 · {summary.fileName}</h3>
      <p className="tm-docx-review-summary-meta">识别 {summary.issuesFound} 项问题</p>
      {conversionLabel ? (
        <p className="tm-docx-review-summary-meta">{conversionLabel}</p>
      ) : null}

      {hasStats ? (
        <div className="tm-docx-review-summary-stats">
          <StatRow
            label="批注"
            requested={summary.commentsRequested}
            applied={summary.commentsApplied}
            failed={summary.commentsFailed}
          />
          <StatRow
            label="替换"
            requested={summary.replacementsRequested}
            applied={summary.replacementsApplied}
            failed={summary.replacementsFailed}
          />
          <StatRow
            label="段落修订"
            requested={summary.paragraphEditsRequested}
            applied={summary.paragraphEditsApplied}
            failed={summary.paragraphEditsFailed}
          />
        </div>
      ) : (
        <p className="tm-docx-review-summary-empty">未执行写入操作</p>
      )}

      {summary.errors && summary.errors.length > 0 ? (
        <div className="tm-docx-review-summary-errors">
          <span className="tm-docx-review-summary-errors-label">错误</span>
          <ul>
            {summary.errors.map((error, index) => (
              <li key={`error-${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.parseWarnings && summary.parseWarnings.length > 0 ? (
        <div className="tm-docx-review-summary-warnings">
          <span className="tm-docx-review-summary-warnings-label">解析警告</span>
          <ul>
            {summary.parseWarnings.map((warning, index) => (
              <li key={`warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
