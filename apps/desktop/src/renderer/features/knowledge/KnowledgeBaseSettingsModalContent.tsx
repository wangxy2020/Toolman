import { MemoryEntryPanel } from './MemoryEntryPanel'
import { KnowledgeBaseSettingsAdvancedTab } from './KnowledgeBaseSettingsAdvancedTab'
import { KnowledgeBaseSettingsBasicTab } from './KnowledgeBaseSettingsBasicTab'
import {
  KnowledgeBaseSettingsLocalWatchTab,
  KnowledgeBaseSettingsNetworkWatchTab,
} from './KnowledgeBaseSettingsWatchTab'
import type { KnowledgeBaseSettingsModalState } from './useKnowledgeBaseSettingsModal'

type ContentProps = KnowledgeBaseSettingsModalState & {
  nameReadOnly?: boolean
}

export function KnowledgeBaseSettingsModalContent(props: ContentProps) {
  const { activeTab, isLocalKb, isNetworkKb, isVectorizedKb, workspaceId, setMemoryCount } = props

  if (activeTab === 'basic') {
    return <KnowledgeBaseSettingsBasicTab {...props} />
  }

  if (activeTab === 'watch' && isLocalKb) {
    return <KnowledgeBaseSettingsLocalWatchTab {...props} />
  }

  if (activeTab === 'watch' && isNetworkKb) {
    return <KnowledgeBaseSettingsNetworkWatchTab {...props} />
  }

  if (activeTab === 'memory') {
    return <MemoryEntryPanel workspaceId={workspaceId} onCountChange={setMemoryCount} />
  }

  if (activeTab === 'advanced' && isVectorizedKb) {
    return <KnowledgeBaseSettingsAdvancedTab {...props} />
  }

  return null
}
