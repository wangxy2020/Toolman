import type { Assistant, Provider, Workspace } from '@toolman/shared'
import { IconSliders } from '../../components/icons'
import { CodeEditorSelector } from './CodeEditorSelector'
import { AssistantNameSelector } from './AssistantNameSelector'
import { MultiModelSelector } from './MultiModelSelector'
import { WorkspaceFolderSelector } from './WorkspaceFolderSelector'
import type { CodeEditorId } from './code-editor-options'

interface Props {
  assistant: Assistant | null
  workspace: Workspace | null
  providers: Provider[]
  selectedModelIds: string[]
  onModelChange: (modelIds: string[]) => void
  onSelectWorkspaceFolder: () => void
  onCodeEditorChange: (editorId: CodeEditorId) => void
  onOpenMessageSettings: () => void
  onOpenAgentSettings: () => void
  messageSettingsOpen?: boolean
  hasConfiguredProvider: boolean
  onOpenSettings: () => void
  groupProxyMode?: boolean
}

export function ChatHeader({
  assistant,
  workspace,
  providers,
  selectedModelIds,
  onModelChange,
  onSelectWorkspaceFolder,
  onCodeEditorChange,
  onOpenMessageSettings,
  onOpenAgentSettings,
  messageSettingsOpen = false,
  hasConfiguredProvider,
  onOpenSettings,
  groupProxyMode = false,
}: Props) {
  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb">
        <AssistantNameSelector assistant={assistant} onOpenSettings={onOpenAgentSettings} />
        <span className="tm-chat-breadcrumb-sep">/</span>
        <MultiModelSelector
          providers={providers}
          selectedModelIds={selectedModelIds}
          onChange={onModelChange}
          readOnly={groupProxyMode}
        />
        <span className="tm-chat-breadcrumb-sep">/</span>
        <WorkspaceFolderSelector
          workspace={workspace}
          onSelectFolder={onSelectWorkspaceFolder}
          readOnly={groupProxyMode}
        />
      </div>

      <div className="tm-chat-header-end">
        {!hasConfiguredProvider && (
          <button type="button" className="tm-model-pill tm-model-pill--warn" onClick={onOpenSettings}>
            配置 API Key
          </button>
        )}

        <CodeEditorSelector workspace={workspace} onChange={onCodeEditorChange} />
        <button
          type="button"
          className={[
            'tm-chat-header-settings-btn',
            messageSettingsOpen ? 'tm-chat-header-settings-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title="消息设置"
          onClick={onOpenMessageSettings}
        >
          <IconSliders size={16} />
        </button>
      </div>
    </header>
  )
}
