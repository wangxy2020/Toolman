import { useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type Provider, type Workspace } from '@toolman/shared'
import { SettingsToggle } from '../settings/SettingsShared'
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

function HelpHint({ title }: { title: string }) {
  return (
    <button type="button" className="tm-agent-help" title={title}>
      i
    </button>
  )
}

function RequiredMark() {
  return <span className="tm-add-agent-required">*</span>
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
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-add-agent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">添加智能体</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="tm-modal-body">
          <div className="tm-form-field">
            <label className="tm-form-label">
              名称
              <RequiredMark />
            </label>
            <input className="tm-form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">
              模型
              <RequiredMark />
              <HelpHint title="选择智能体使用的默认模型" />
            </label>
            <div className="tm-agent-model-select-wrap">
              <select
                className="tm-agent-model-select tm-add-agent-model-select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              >
                <option value="">{modelOptions.length === 0 ? '请先在模型服务中配置模型' : '选择模型'}</option>
                {modelOptions.map((opt) => (
                  <option key={opt.modelId} value={opt.modelId}>
                    {modelNameFromId(opt.modelId)} | {providerNameFromModelId(opt.modelId, providers)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="tm-add-agent-row">
            <label className="tm-form-label tm-add-agent-row-label">
              自主模式
              <HelpHint title="开启后智能体可自主执行更多操作" />
            </label>
            <SettingsToggle checked={autonomousMode} onChange={setAutonomousMode} />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">
              权限模式
              <RequiredMark />
            </label>
            <div className="tm-agent-model-select-wrap">
              <select
                className="tm-agent-model-select tm-add-agent-model-select"
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              >
                {PERMISSION_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedPermission && (
              <p className="tm-add-agent-hint">{selectedPermission.description}</p>
            )}
          </div>

          <div className="tm-form-field">
            <div className="tm-add-agent-label-row">
              <label className="tm-form-label">工作目录</label>
              <button
                type="button"
                className="tm-add-agent-dir-btn"
                onClick={() => void handleSelectWorkingDirectory()}
              >
                添加目录
              </button>
            </div>
            {workingDirectory ? (
              <div className="tm-agent-workdir-row">
                <span className="tm-agent-workdir-path" title={workingDirectory}>
                  {workingDirectory}
                </span>
                <button
                  type="button"
                  className="tm-agent-workdir-delete"
                  onClick={handleRemoveWorkingDirectory}
                >
                  删除
                </button>
              </div>
            ) : (
              <p className="tm-add-agent-hint">未指定时将自动创建默认工作目录。</p>
            )}
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">
              环境变量
              <HelpHint title="为智能体运行环境注入自定义变量" />
            </label>
            <textarea
              className="tm-form-textarea tm-add-agent-env-textarea"
              rows={4}
              value={environmentVariables}
              placeholder={'API_KEY=xxx\nDEBUG=true'}
              onChange={(e) => setEnvironmentVariables(e.target.value)}
            />
            <p className="tm-add-agent-hint">输入自定义环境变量（每行一个，格式：KEY=value）</p>
          </div>

          {message && (
            <p className={`tm-form-msg ${message.includes('失败') || message.includes('请') ? 'tm-form-msg--error' : ''}`}>
              {message}
            </p>
          )}

          <div className="tm-form-actions">
            <button type="button" className="tm-btn" onClick={onClose}>
              关闭
            </button>
            <button
              type="button"
              className="tm-btn tm-btn--primary"
              disabled={busy}
              onClick={() => void handleAdd()}
            >
              {busy ? '处理中…' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
