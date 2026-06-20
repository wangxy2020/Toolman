import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CHANNEL_PLATFORMS,
  IpcChannel,
  type Assistant,
  type ChannelPlatformId,
  type ChannelRuntimeStatus,
  type ImChannelConfigPublic,
} from '@toolman/shared'
import { IconCopy } from '../../components/icons'
import {
  SettingsInput,
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
} from './SettingsShared'
import {
  channelStatusLabel,
  clearLegacyChannelConfigs,
  loadLegacyChannelConfigs,
} from './channel-settings'

interface ModalProps {
  config: ImChannelConfigPublic
  assistants: Assistant[]
  webhookPath: string
  onClose: () => void
  onSave: (config: Partial<ImChannelConfigPublic> & { platform: ChannelPlatformId; appSecret?: string; encryptKey?: string }) => void
  onTest: (platform: ChannelPlatformId) => Promise<string | null>
}

function ChannelFormLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label className="tm-channel-config-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="tm-channel-config-required">*</span> : null}
    </label>
  )
}

function hasWebhookUrl(platform: ChannelPlatformId): boolean {
  return platform === 'feishu' || platform === 'wechat'
}

function getEnableDescription(platform: ChannelPlatformId, platformName: string): string {
  switch (platform) {
    case 'feishu':
      return '开启后智能体将可以通过飞书接收与回复消息'
    case 'dingtalk':
      return '开启后智能体将可以通过钉钉接收与回复消息'
    case 'wechat':
      return '开启后智能体将可以通过企业微信接收与回复消息'
    case 'discord':
      return '开启后智能体将可以通过 Discord 接收与回复消息'
    default:
      return `开启后智能体将可以通过${platformName}接收与回复消息`
  }
}

function getConnectionHint(platform: ChannelPlatformId): string | null {
  switch (platform) {
    case 'discord':
      return 'Discord 通过 Bot Gateway 长连接接收消息，将 Bot Token 填入「应用密钥」即可。'
    case 'dingtalk':
      return '钉钉通过 Stream 长连接接收消息。在开发者后台启用机器人并选择 Stream 模式，将 AppKey 填入「应用 ID」、AppSecret 填入「应用密钥」。'
    case 'feishu':
      return '请在飞书开发者后台 → 事件订阅中，将请求地址配置为上述 URL，并订阅「接收消息」事件。'
    case 'wechat':
      return '请在企业微信开发者后台配置回调 URL，填写 Token 与 EncodingAESKey，并在「域名」字段填写应用 AgentId。'
    default:
      return '该平台运行时适配即将推出，可先保存配置。'
  }
}

function getAppSecretLabel(platform: ChannelPlatformId): string {
  switch (platform) {
    case 'discord':
      return '应用密钥 (Bot Token)'
    case 'dingtalk':
      return '应用密钥 (App Secret)'
    case 'wechat':
      return '应用密钥 (CorpSecret)'
    default:
      return '应用密钥 (App Secret)'
  }
}

function getDomainPlaceholder(platform: ChannelPlatformId): string {
  switch (platform) {
    case 'feishu':
      return '飞书（中国）'
    case 'wechat':
      return '应用 AgentId（数字）'
    default:
      return '默认'
  }
}

function ChannelConfigModal({
  config,
  assistants,
  webhookPath,
  onClose,
  onSave,
  onTest,
}: ModalProps) {
  const [draft, setDraft] = useState(config)
  const [appSecret, setAppSecret] = useState('')
  const [encryptKey, setEncryptKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDraft(config)
    setAppSecret('')
    setEncryptKey('')
    setTestMessage(null)
    setCopied(false)
  }, [config])

  const platformName =
    CHANNEL_PLATFORMS.find((item) => item.id === draft.platform)?.name ?? draft.platform
  const connectionHint = getConnectionHint(draft.platform)
  const showWebhook = hasWebhookUrl(draft.platform)

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookPath)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setTestMessage('复制失败，请手动选择文本复制')
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--channel-config" onClick={onClose}>
      <div
        className="tm-channel-config-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-channel-config-header">
          <h3 className="tm-channel-config-title">
            <span className="tm-channel-config-title-dot" aria-hidden="true" />
            {platformName} 频道配置
          </h3>
          <button type="button" className="tm-channel-config-close" aria-label="关闭" onClick={onClose}>
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

        <div className="tm-channel-config-body">
          <div className="tm-channel-config-card">
            <div className="tm-channel-config-enable-row">
              <div className="tm-channel-config-enable-copy">
                <span className="tm-channel-config-enable-title">启用{platformName}频道</span>
                <p className="tm-channel-config-enable-desc">
                  {getEnableDescription(draft.platform, platformName)}
                </p>
              </div>
              <SettingsToggle
                checked={draft.enabled}
                onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            {showWebhook ? (
              <div className="tm-channel-config-webhook">
                <ChannelFormLabel>回调地址 (Webhook URL)</ChannelFormLabel>
                <div className="tm-channel-config-webhook-input">
                  <input
                    className="tm-channel-config-webhook-value"
                    type="text"
                    readOnly
                    value={webhookPath}
                  />
                  <button
                    type="button"
                    className="tm-channel-config-webhook-copy"
                    onClick={() => void handleCopyWebhook()}
                  >
                    <IconCopy size={14} />
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                {connectionHint ? (
                  <p className="tm-channel-config-webhook-hint">{connectionHint}</p>
                ) : null}
              </div>
            ) : connectionHint ? (
              <p className="tm-channel-config-platform-hint">{connectionHint}</p>
            ) : null}
          </div>

          <div className="tm-channel-config-grid-2">
            <div className="tm-channel-config-field">
              <ChannelFormLabel>频道名称</ChannelFormLabel>
              <SettingsInput
                value={draft.name}
                onChange={(name) => setDraft((prev) => ({ ...prev, name }))}
              />
            </div>

            <div className="tm-channel-config-field">
              <ChannelFormLabel>绑定智能体</ChannelFormLabel>
              <SettingsSelect
                value={draft.assistantId || ''}
                options={[
                  { value: '', label: '请选择智能体...' },
                  ...assistants.map((assistant) => ({
                    value: assistant.id,
                    label: assistant.name,
                  })),
                ]}
                onChange={(assistantId) => setDraft((prev) => ({ ...prev, assistantId }))}
              />
            </div>
          </div>

          <div className="tm-channel-config-section">
            <span className="tm-channel-config-section-title">
              {platformName} 凭证配置 (App Credentials)
            </span>

            <div className="tm-channel-config-card tm-channel-config-card--flat">
              <div className="tm-channel-config-field">
                <ChannelFormLabel required>应用 ID (App ID)</ChannelFormLabel>
                <SettingsInput
                  value={draft.appId}
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  onChange={(appId) => setDraft((prev) => ({ ...prev, appId }))}
                />
              </div>

              <div className="tm-channel-config-field">
                <ChannelFormLabel required>{getAppSecretLabel(draft.platform)}</ChannelFormLabel>
                <SettingsInput
                  type="password"
                  value={appSecret}
                  placeholder={draft.hasAppSecret ? '已保存，留空则不修改' : '••••••••••••••••••••••••••••••••'}
                  onChange={setAppSecret}
                />
              </div>

              <div className="tm-channel-config-grid-2">
                <div className="tm-channel-config-field">
                  <ChannelFormLabel>加密密钥 (Encrypt Key)</ChannelFormLabel>
                  <SettingsInput
                    type="password"
                    value={encryptKey}
                    placeholder={draft.hasEncryptKey ? '已保存，留空则不修改' : '选填'}
                    onChange={setEncryptKey}
                  />
                </div>

                <div className="tm-channel-config-field">
                  <ChannelFormLabel>验证令牌 (Verification Token)</ChannelFormLabel>
                  <SettingsInput
                    type="password"
                    value={draft.verificationToken}
                    placeholder="选填"
                    onChange={(verificationToken) => setDraft((prev) => ({ ...prev, verificationToken }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="tm-channel-config-grid-2">
            <div className="tm-channel-config-field">
              <ChannelFormLabel>域名</ChannelFormLabel>
              <SettingsInput
                value={draft.domain}
                placeholder={getDomainPlaceholder(draft.platform)}
                onChange={(domain) => setDraft((prev) => ({ ...prev, domain }))}
              />
            </div>

            <div className="tm-channel-config-field">
              <ChannelFormLabel>允许的聊天 ID</ChannelFormLabel>
              <SettingsInput
                value={draft.allowedChatIds}
                placeholder="留空表示不限制"
                onChange={(allowedChatIds) => setDraft((prev) => ({ ...prev, allowedChatIds }))}
              />
            </div>
          </div>

          <p className="tm-channel-config-field-hint">
            可填写群聊或单聊 ID，多个 ID 用逗号分隔；留空则响应所有会话。
          </p>

          {testMessage ? <div className="tm-settings-error">{testMessage}</div> : null}
        </div>

        <footer className="tm-channel-config-footer">
          <div className="tm-channel-config-footer-actions">
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              disabled={testing}
              onClick={() => {
                setTesting(true)
                setTestMessage(null)
                void onTest(draft.platform)
                  .then((message) => {
                    if (message) setTestMessage(message)
                  })
                  .finally(() => setTesting(false))
              }}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--primary"
              onClick={() =>
                onSave({
                  ...draft,
                  ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
                  ...(encryptKey.trim() ? { encryptKey: encryptKey.trim() } : {}),
                })
              }
            >
              保存配置
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

interface Props {
  workspaceId: string | null
}

export function ChannelsSettingsPanel({ workspaceId }: Props) {
  const [configs, setConfigs] = useState<ImChannelConfigPublic[]>([])
  const [statuses, setStatuses] = useState<Record<string, ChannelRuntimeStatus>>({})
  const [statusMessages, setStatusMessages] = useState<Record<string, string | undefined>>({})
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('')
  const [webhookPaths, setWebhookPaths] = useState<Record<string, string>>({})
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [editingPlatform, setEditingPlatform] = useState<ChannelPlatformId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadChannels = useCallback(async () => {
    setLoading(true)
    const [listResult, statusResult, webhookResult] = await Promise.all([
      window.api.invoke(IpcChannel.ImChannelList, {}),
      window.api.invoke(IpcChannel.ImChannelStatusList, {}),
      window.api.invoke(IpcChannel.ImChannelWebhookInfo, {}),
    ])
    setLoading(false)

    if (!listResult.ok) {
      setError(listResult.error.message)
      return
    }

    const listData = listResult.data as {
      webhookBaseUrl: string
      items: ImChannelConfigPublic[]
    }
    setConfigs(listData.items)
    setWebhookBaseUrl(listData.webhookBaseUrl)

    if (statusResult.ok) {
      const statusData = statusResult.data as {
        items: Array<{
          platform: ChannelPlatformId
          status: ChannelRuntimeStatus
          message?: string
        }>
      }
      setStatuses(Object.fromEntries(statusData.items.map((item) => [item.platform, item.status])))
      setStatusMessages(Object.fromEntries(statusData.items.map((item) => [item.platform, item.message])))
    }

    if (webhookResult.ok) {
      const webhookData = webhookResult.data as { paths: Record<string, string> }
      setWebhookPaths(webhookData.paths)
    }

    setError(null)
  }, [])

  useEffect(() => {
    void (async () => {
      const legacy = loadLegacyChannelConfigs()
      for (const item of legacy) {
        await window.api.invoke(IpcChannel.ImChannelUpsert, item)
      }
      if (legacy.length > 0) clearLegacyChannelConfigs()
      await loadChannels()
    })()
  }, [loadChannels])

  useEffect(() => {
    if (!workspaceId) return
    void (async () => {
      const result = await window.api.invoke(IpcChannel.AssistantList, { workspaceId })
      if (result.ok) {
        setAssistants(result.data as Assistant[])
      }
    })()
  }, [workspaceId])

  const configMap = useMemo(
    () => Object.fromEntries(configs.map((item) => [item.platform, item])),
    [configs],
  )

  const editingConfig = editingPlatform ? configMap[editingPlatform] : null

  const handleSave = async (
    config: Partial<ImChannelConfigPublic> & {
      platform: ChannelPlatformId
      appSecret?: string
      encryptKey?: string
    },
  ) => {
    const result = await window.api.invoke(IpcChannel.ImChannelUpsert, config)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setEditingPlatform(null)
    await loadChannels()
  }

  const handleTest = async (platform: ChannelPlatformId): Promise<string | null> => {
    const result = await window.api.invoke(IpcChannel.ImChannelTest, { platform })
    if (!result.ok) return result.error.message
    const data = result.data as { ok: boolean; message: string }
    return data.ok ? data.message : data.message
  }

  return (
    <SettingsPageLayout>
      {error ? <div className="tm-settings-error">{error}</div> : null}
      {loading ? <div className="tm-settings-loading">加载中…</div> : null}

      <SettingsSection
        title="频道"
        intro="将智能体接入飞书、钉钉、企业微信、QQ、Discord、Slack 等平台。飞书、钉钉、Discord、企业微信已可用；QQ/Slack 为「即将推出」。启用后会启动本地 Webhook 服务（钉钉使用 Stream 长连接）；渠道消息遵循智能体工具权限设置（危险操作仍需审批，心跳任务除外）。"
      >
        <div className="tm-channel-webhook-hint">
          本地 Webhook 基址：<code>{webhookBaseUrl || '—'}</code>
        </div>

        {CHANNEL_PLATFORMS.map((platform) => {
          const config = configMap[platform.id]
          const enabled = config?.enabled ?? false
          const status = statuses[platform.id] ?? 'stopped'
          const statusMessage = statusMessages[platform.id]
          return (
            <SettingsRow
              key={platform.id}
              label={platform.name}
              hint={
                enabled
                  ? `${config?.name ?? platform.name} · ${channelStatusLabel(status)}${statusMessage ? ` · ${statusMessage}` : ''}`
                  : '未配置'
              }
            >
              <div className="tm-channel-row-actions">
                <span className={`tm-channel-status tm-channel-status--${status}`}>
                  {channelStatusLabel(status)}
                </span>
                <SettingsToggle
                  checked={enabled}
                  onChange={() => setEditingPlatform(platform.id)}
                />
              </div>
            </SettingsRow>
          )
        })}
      </SettingsSection>

      {editingConfig && editingPlatform && (
        <ChannelConfigModal
          config={editingConfig}
          assistants={assistants}
          webhookPath={webhookPaths[editingPlatform] ?? `${webhookBaseUrl}/${editingPlatform}/events`}
          onClose={() => setEditingPlatform(null)}
          onSave={(config) => void handleSave(config)}
          onTest={async (platform) => {
            const message = await handleTest(platform)
            return message
          }}
        />
      )}
    </SettingsPageLayout>
  )
}
