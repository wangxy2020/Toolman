import { IconChevronDown, IconSliders } from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { CodeEditorSelector } from '../chat/CodeEditorSelector'
import { MultiModelSelector } from '../chat/MultiModelSelector'
import { WorkspaceFolderSelector } from '../chat/WorkspaceFolderSelector'
import type { CodeEditorId } from '../chat/code-editor-options'
import type { Provider, Workspace } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  taskName: string | null
  workspace: Workspace | null
  providers: Provider[]
  selectedModelIds: string[]
  onModelChange: (modelIds: string[]) => void
  onSelectWorkspaceFolder: () => void
  onCodeEditorChange: (editorId: CodeEditorId) => void
  onOpenTaskSettings: () => void
  onOpenAutomationSettings: () => void
  automationSettingsOpen?: boolean
  hasConfiguredProvider: boolean
  onOpenSettings: () => void
}

export function WorkflowPageHeader({
  taskName,
  workspace,
  providers,
  selectedModelIds,
  onModelChange,
  onSelectWorkspaceFolder,
  onCodeEditorChange,
  onOpenTaskSettings,
  onOpenAutomationSettings,
  automationSettingsOpen = false,
  hasConfiguredProvider,
  onOpenSettings,
}: Props) {
  const { t } = useI18n()

  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb">
        {taskName ? (
          <button
            type="button"
            className="tm-model-pill tm-agent-pill"
            onClick={onOpenTaskSettings}
            title={t('workflowPage.taskSettingsTitle')}
          >
            <span className="tm-agent-pill-label">{taskName}</span>
            <IconChevronDown />
          </button>
        ) : (
          <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
            {t('modules.workflow.headerAll')}
          </span>
        )}
        <span className="tm-chat-breadcrumb-sep">/</span>
        <MultiModelSelector
          providers={providers}
          selectedModelIds={selectedModelIds}
          onChange={onModelChange}
        />
        <span className="tm-chat-breadcrumb-sep">/</span>
        <WorkspaceFolderSelector
          workspace={workspace}
          workingDirectory={undefined}
          onSelectFolder={onSelectWorkspaceFolder}
        />
      </div>

      <div className="tm-chat-header-end">
        {!hasConfiguredProvider && (
          <button type="button" className="tm-model-pill tm-model-pill--warn" onClick={onOpenSettings}>
            {t('chat.configureApiKey')}
          </button>
        )}

        <CodeEditorSelector workspace={workspace} onChange={onCodeEditorChange} />
        <HeaderIconButton
          label={t('workflowPage.settingsTitle')}
          active={automationSettingsOpen}
          onClick={onOpenAutomationSettings}
        >
          <IconSliders size={16} />
        </HeaderIconButton>
      </div>
    </header>
  )
}
