import { useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type Provider, type Workspace } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { getPermissionModes } from '../../i18n/agent-labels'
import { buildModelOptions, modelNameFromId, providerNameFromModelId } from './model-utils'
import { useSystemPaths } from './useSystemPaths'
import { getWorkspaceFolderPath } from './workspace-utils'
import {
  AssistantSettingsHelpHint,
  AssistantSettingsRequiredMark,
} from './assistant-settings-components'
import {
  DEFAULT_PERMISSION_MODE,
  type PermissionMode,
} from './agent-settings-constants'

interface Props {
  workspaceId: string
  workspace: Workspace | null
  providers: Provider[]
  onClose: () => void
  onSaved?: (assistant: Assistant) => void | Promise<void>
}

export function AssistantSettings({ workspaceId, workspace, providers, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const systemPaths = useSystemPaths()
  const [name, setName] = useState(t('agent.newAssistant'))
  const [modelId, setModelId] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(DEFAULT_PERMISSION_MODE)
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [environmentVariables, setEnvironmentVariables] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const modelOptions = useMemo(() => buildModelOptions(providers), [providers])
  const permissionModes = useMemo(() => getPermissionModes(t), [t])
  const selectedPermission = permissionModes.find((mode) => mode.id === permissionMode)

  const handleSelectWorkingDirectory = async () => {
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFolder, {
      defaultPath: workingDirectory || getWorkspaceFolderPath(workspace, systemPaths) || undefined,
    })
    if (!pickResult.ok) return
    const { path } = pickResult.data as { path: string | null }
    if (!path) return
    setWorkingDirectory(path)
  }

  const handleRemoveWorkingDirectory = () => {
    setWorkingDirectory('')
  }

  const handleAdd = async () => {
    if (!name.trim()) {
      setMessage(t('agent.errors.nameRequired'))
      return
    }
    if (!modelId) {
      setMessage(t('agent.errors.modelRequired'))
      return
    }
    if (!permissionMode) {
      setMessage(t('agent.errors.permissionRequired'))
      return
    }

    setBusy(true)
    setMessage(null)

    const parameters = {
      permissionMode,
      ...(workingDirectory ? { workingDirectory } : {}),
      ...(environmentVariables.trim() ? { environmentVariables: environmentVariables.trim() } : {}),
    }

    const result = await window.api.invoke(IpcChannel.AssistantCreate, {
      workspaceId,
      name: name.trim(),
      systemPrompt: t('agent.defaultSystemPrompt'),
      modelId,
      parameters,
    })

    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }

    const assistant = result.data as Assistant
    await onSaved?.(assistant)
    onClose()
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal tm-agent-modal--create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-agent-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="add-agent-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('agent.addAssistant')}
          </h3>
          <button
            type="button"
            className="tm-agent-modal-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-agent-modal-body tm-agent-modal-body--single">
          <div className="tm-agent-modal-content">
            <div className="tm-agent-settings-form">
              <div className="tm-agent-setting-row">
                <label className="tm-agent-setting-label" htmlFor="add-agent-name">
                  {t('common.name')}
                  <AssistantSettingsRequiredMark />
                </label>
                <input
                  id="add-agent-name"
                  className="tm-agent-setting-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <label className="tm-agent-setting-label" htmlFor="add-agent-model">
                    {t('agent.fields.model')}
                  </label>
                  <AssistantSettingsRequiredMark />
                  <AssistantSettingsHelpHint title={t('agent.fields.modelHintCreate')} />
                </div>
                <select
                  id="add-agent-model"
                  className="tm-agent-model-select"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  <option value="">
                    {modelOptions.length === 0
                      ? t('agent.fields.noModels')
                      : t('agent.fields.selectModel')}
                  </option>
                  {modelOptions.map((opt) => (
                    <option key={opt.modelId} value={opt.modelId}>
                      {`${modelNameFromId(opt.modelId)} | ${providerNameFromModelId(opt.modelId, providers)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label" htmlFor="add-agent-permission">
                  {t('agent.permissionTab.title')}
                  <AssistantSettingsRequiredMark />
                </label>
                <div className="tm-agent-setting-block">
                  <select
                    id="add-agent-permission"
                    className="tm-agent-model-select"
                    value={permissionMode}
                    onChange={(event) => setPermissionMode(event.target.value as PermissionMode)}
                  >
                    {permissionModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.title}
                      </option>
                    ))}
                  </select>
                  {selectedPermission ? (
                    <p className="tm-agent-field-hint">{selectedPermission.description}</p>
                  ) : null}
                </div>
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label">{t('agent.fields.workingDirectory')}</label>
                <div className="tm-agent-workdir-field">
                  <div className="tm-agent-workdir-input-group">
                    <input
                      className="tm-agent-workdir-input"
                      readOnly
                      value={workingDirectory}
                      placeholder={t('agent.fields.workingDirectoryDefault')}
                      title={workingDirectory || undefined}
                    />
                    <button
                      type="button"
                      className="tm-agent-workdir-browse"
                      onClick={() => void handleSelectWorkingDirectory()}
                    >
                      {t('agent.browse')}
                    </button>
                  </div>
                  {workingDirectory ? (
                    <button
                      type="button"
                      className="tm-agent-workdir-reset"
                      onClick={handleRemoveWorkingDirectory}
                    >
                      {t('common.clear')}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <div className="tm-agent-setting-label-group">
                  <label className="tm-agent-setting-label" htmlFor="add-agent-env">
                    {t('agent.fields.envVars')}
                  </label>
                  <AssistantSettingsHelpHint title={t('agent.fields.envVarsHint')} />
                </div>
                <div className="tm-agent-setting-block">
                  <textarea
                    id="add-agent-env"
                    className="tm-agent-setting-textarea tm-agent-setting-textarea--mono"
                    rows={4}
                    value={environmentVariables}
                    placeholder={'API_KEY=xxx\nDEBUG=true'}
                    onChange={(event) => setEnvironmentVariables(event.target.value)}
                  />
                  <p className="tm-agent-field-hint">{t('agent.fields.envVarsPlaceholder')}</p>
                </div>
              </div>

              {message ? <p className="tm-agent-form-error">{message}</p> : null}
            </div>
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            disabled={busy}
            onClick={() => void handleAdd()}
          >
            {busy ? t('agent.processing') : t('common.add')}
          </button>
        </footer>
      </div>
    </div>
  )
}
