import { View } from 'react-native'
import { useMobileApp } from '../state/MobileAppContext'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import { knowledgePaneStyles as styles } from './KnowledgePanes.styles'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from './modulePageStatus'
import {
  DEFAULT_SYNC_FOLDER_ID,
  getKnowledgeSection,
} from './knowledgeSidebar'
import { useKnowledgeUi } from './useKnowledgeUi'

export function KnowledgeRightPane() {
  const {
    activeSection,
    activeKbId,
    documentsByKb,
    addDocuments,
    deleteDocument,
    reindexDocuments,
    moveDocuments,
    importError,
    setImportError,
    syncedKbs,
    createdKbs,
  } = useKnowledgeUi()
  const { syncStatus } = useMobileApp()
  const section = getKnowledgeSection(activeSection)
  const documents = activeKbId ? (documentsByKb[activeKbId] ?? []) : []
  const pendingCount = documents.filter((item) => item.status === 'pending').length

  useRegisterModulePanelError('knowledge-import', importError, () => setImportError(null))
  useRegisterModulePanelStatus(
    'knowledge-sync',
    syncStatus === 'syncing'
      ? { tone: 'info', message: '正在同步知识库…' }
      : syncStatus === 'offline'
        ? { tone: 'warning', message: '未连接桌面，知识库仅保存在本地' }
        : syncStatus === 'error'
          ? { tone: 'error', message: '知识库同步失败' }
          : null,
  )
  useRegisterModulePanelStatus(
    'knowledge-ingest',
    pendingCount > 0
      ? { tone: 'info', message: `正在处理 ${pendingCount} 个文档…` }
      : null,
  )
  useRegisterModulePanelStatus(
    'knowledge-ready',
    importError ||
    pendingCount > 0 ||
    syncStatus === 'syncing' ||
    syncStatus === 'error' ||
    syncStatus === 'offline'
      ? null
      : {
          tone: 'muted',
          message: '就绪',
          meta: activeKbId ? `${documents.length} 个文档` : undefined,
        },
  )

  return (
    <View style={styles.rightRoot}>
      <KnowledgeFilePanel
        documents={documents}
        mode={section.importMode}
        showDropzone
        importDisabled
        listKey={activeKbId}
        syncMoveTargets={[
          ...createdKbs
            .filter((kb) => kb.kind === 'sync')
            .map((kb) => ({ id: kb.id, name: kb.name })),
          ...syncedKbs
            .filter((kb) => !createdKbs.some((created) => created.id === kb.id))
            .map((kb) => ({ id: kb.id, name: kb.name })),
        ]}
        onImportFiles={(items) => {
          if (!activeKbId) return
          addDocuments(activeKbId, items)
        }}
        onDeleteDocument={(id) => {
          if (!activeKbId) return
          deleteDocument(activeKbId, id)
        }}
        onReindexDocument={(id) => {
          if (!activeKbId) return
          reindexDocuments(activeKbId, [id])
        }}
        onReindexAll={() => {
          if (!activeKbId) return
          reindexDocuments(activeKbId)
        }}
        onMoveToSync={(ids, target) => {
          if (!activeKbId) return
          const destId = target.type === 'default' ? DEFAULT_SYNC_FOLDER_ID : target.kbId
          moveDocuments(activeKbId, destId, ids)
        }}
        onImportError={setImportError}
      />
    </View>
  )
}
