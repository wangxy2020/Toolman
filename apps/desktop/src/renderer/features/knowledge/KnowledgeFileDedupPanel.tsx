import { KnowledgeFileDedupPanelBody } from './KnowledgeFileDedupPanelBody'
import type { KnowledgeFileDedupPanelProps } from './knowledge-dedup-types'
import { useKnowledgeFileDedupPanel } from './useKnowledgeFileDedupPanel'

export type { DedupScanProgress, DedupScanState } from './knowledge-dedup-types'

export function KnowledgeFileDedupPanel(props: KnowledgeFileDedupPanelProps) {
  const state = useKnowledgeFileDedupPanel(props)
  const { t, folderPath } = state

  if (!folderPath) {
    return (
      <div className="tm-dedup-empty">
        <p className="tm-dedup-empty-title">{t('knowledgePage.dedup.pickFolderTitle')}</p>
        <p className="tm-dedup-empty-hint">{t('knowledgePage.dedup.pickFolderHint')}</p>
      </div>
    )
  }

  return (
    <div className="tm-dedup-page">
      <KnowledgeFileDedupPanelBody {...state} />
    </div>
  )
}
