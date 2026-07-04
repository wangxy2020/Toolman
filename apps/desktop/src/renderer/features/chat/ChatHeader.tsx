import type { RefObject } from 'react'
import type { Assistant, Provider, Workspace } from '@toolman/shared'
import { IconSliders } from '../../components/icons'
import { IconTaskList } from '../../components/icons/rich-text'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { CodeEditorSelector } from './CodeEditorSelector'
import { AssistantNameSelector } from './AssistantNameSelector'
import { MultiModelSelector } from './MultiModelSelector'
import { WorkspaceFolderSelector } from './WorkspaceFolderSelector'
import type { CodeEditorId } from './code-editor-options'
import { useI18n } from '../../i18n/useI18n'

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
  agentTasksMenu?: {
    open: boolean
    buttonRef: RefObject<HTMLButtonElement | null>
    activeCount: number
    onToggle: () => void
  }
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
  agentTasksMenu,
}: Props) {
  const { t } = useI18n()
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
          workingDirectory={assistant?.parameters.workingDirectory}
          onSelectFolder={onSelectWorkspaceFolder}
          readOnly={groupProxyMode}
        />
      </div>

      <div className="tm-chat-header-end">
        {!hasConfiguredProvider && (
          <button type="button" className="tm-model-pill tm-model-pill--warn" onClick={onOpenSettings}>
            {t('chat.configureApiKey')}
          </button>
        )}

        {agentTasksMenu ? (
          <HeaderIconButton
            ref={agentTasksMenu.buttonRef}
            className="tm-agent-tasks-menu-btn"
            label={t('chat.tasks.menuButtonTitle')}
            active={agentTasksMenu.open}
            aria-pressed={agentTasksMenu.open}
            aria-expanded={agentTasksMenu.open}
            data-testid="agent-tasks-menu-button"
            onClick={agentTasksMenu.onToggle}
          >
            <IconTaskList size={16} />
            {agentTasksMenu.activeCount > 0 ? (
              <span className="tm-agent-tasks-menu-badge" aria-hidden="true">
                {agentTasksMenu.activeCount}
              </span>
            ) : null}
          </HeaderIconButton>
        ) : null}
        <CodeEditorSelector workspace={workspace} onChange={onCodeEditorChange} />
        <HeaderIconButton
          label={t('chat.messageSettings')}
          active={messageSettingsOpen}
          onClick={onOpenMessageSettings}
        >
          <IconSliders size={16} />
        </HeaderIconButton>
      </div>
    </header>
  )
}
