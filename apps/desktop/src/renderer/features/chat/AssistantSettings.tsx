import { useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type Provider, type Workspace } from '@toolman/shared'
import { buildModelOptions, modelNameFromId, providerNameFromModelId } from './model-utils'
import { useSystemPaths } from './useSystemPaths'
import { getWorkspaceFolderPath } from './workspace-utils'
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODES,
  type PermissionMode,
} from './agent-settings-constants'

interface Props {
  workspaceId: string
  workspace: Workspace | null
  providers: Provider[]
  onClose: () => void
  onSaved?: (assistant: Assistant) => void | Promise<void>
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-agent-toggle ${checked ? 'tm-agent-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-agent-toggle-thumb" />
    </button>
  )
}

function HelpHint({ title }: { title: string }) {
  return (
    <span className="tm-agent-help" title={title} aria-label={title}>
      ⓘ
    </span>
  )
}

function RequiredMark() {
  return (
    <span className="tm-agent-required" aria-hidden="true">
      *
    </span>
  )
}

export function AssistantSettings({ workspaceId, workspace, providers, onClose, onSaved }: Props) {
  const systemPaths = useSystemPaths()
  const [name, setName] = useState('新智能体')
  const [modelId, setModelId] = useState('')
  const [autonomousMode, setAutonomousMode] = useState(false)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(DEFAULT_PERMISSION_MODE)
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [environmentVariables, setEnvironmentVariables] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const modelOptions = useMemo(() => buildModelOptions(providers), [providers])
  const selectedPermission = PERMISSION_MODES.find((mode) => mode.id === permissionMode)

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
      setMessage('请填写名称')
      return
    }
    if (!modelId) {
      setMessage('请选择模型')
      return
    }
    if (!permissionMode) {
      setMessage('请选择权限模式')
      return
    }

    setBusy(true)
    setMessage(null)

    const parameters = {
      permissionMode,
      autonomousMode,
      ...(workingDirectory ? { workingDirectory } : {}),
      ...(environmentVariables.trim() ? { environmentVariables: environmentVariables.trim() } : {}),
    }

    const result = await window.api.invoke(IpcChannel.AssistantCreate, {
      workspaceId,
      name: name.trim(),
      systemPrompt: '你是一个有帮助的 AI 助手。',
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
            添加智能体
          </h3>
          <button type="button" className="tm-agent-modal-close" aria-label="关闭" onClick={onClose}>
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
                  名称
                  <RequiredMark />
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
                    模型
                  </label>
                  <RequiredMark />
                  <HelpHint title="选择智能体使用的默认模型" />
                </div>
                <select
                  id="add-agent-model"
                  className="tm-agent-model-select"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  <option value="">
                    {modelOptions.length === 0 ? '请先在模型服务中配置模型' : '选择模型'}
                  </option>
                  {modelOptions.map((opt) => (
                    <option key={opt.modelId} value={opt.modelId}>
                      {`${modelNameFromId(opt.modelId)} | ${providerNameFromModelId(opt.modelId, providers)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <span className="tm-agent-setting-label">自主模式</span>
                  <HelpHint title="开启后智能体可自主执行更多操作" />
                </div>
                <Toggle checked={autonomousMode} onChange={setAutonomousMode} />
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label" htmlFor="add-agent-permission">
                  权限模式
                  <RequiredMark />
                </label>
                <div className="tm-agent-setting-block">
                  <select
                    id="add-agent-permission"
                    className="tm-agent-model-select"
                    value={permissionMode}
                    onChange={(event) => setPermissionMode(event.target.value as PermissionMode)}
                  >
                    {PERMISSION_MODES.map((mode) => (
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
                <label className="tm-agent-setting-label">工作目录</label>
                <div className="tm-agent-workdir-field">
                  <div className="tm-agent-workdir-input-group">
                    <input
                      className="tm-agent-workdir-input"
                      readOnly
                      value={workingDirectory}
                      placeholder="未指定时将自动创建默认工作目录"
                      title={workingDirectory || undefined}
                    />
                    <button
                      type="button"
                      className="tm-agent-workdir-browse"
                      onClick={() => void handleSelectWorkingDirectory()}
                    >
                      浏览
                    </button>
                  </div>
                  {workingDirectory ? (
                    <button
                      type="button"
                      className="tm-agent-workdir-reset"
                      onClick={handleRemoveWorkingDirectory}
                    >
                      清除目录
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <div className="tm-agent-setting-label-group">
                  <label className="tm-agent-setting-label" htmlFor="add-agent-env">
                    环境变量
                  </label>
                  <HelpHint title="为智能体运行环境注入自定义变量" />
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
                  <p className="tm-agent-field-hint">每行一个，格式：KEY=value</p>
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
            取消
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            disabled={busy}
            onClick={() => void handleAdd()}
          >
            {busy ? '处理中…' : '添加'}
          </button>
        </footer>
      </div>
    </div>
  )
}
