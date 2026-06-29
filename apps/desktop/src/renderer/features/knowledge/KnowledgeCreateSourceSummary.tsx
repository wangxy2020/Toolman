import { useI18n } from '../../i18n/useI18n'
import type { KnowledgeFileTypeCount } from './knowledge-file-types'

export function KnowledgeCreateSourceSummary({
  title,
  counts,
  total,
}: {
  title: string
  counts: KnowledgeFileTypeCount[]
  total: number
}) {
  const { t } = useI18n()

  return (
    <div className="tm-kb-source-summary">
      <p className="tm-kb-source-summary-title">{title}</p>
      <ul className="tm-kb-source-summary-list">
        {counts.map((item) => (
          <li key={item.type}>
            <span className="tm-kb-source-summary-label">{item.label}</span>
            <span className="tm-kb-source-summary-count">{item.count}</span>
          </li>
        ))}
      </ul>
      <p className="tm-agent-field-hint">{t('modals.knowledgeCreate.totalFiles', { count: total })}</p>
    </div>
  )
}
