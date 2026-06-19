import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CHANNEL_PLATFORMS,
  IpcChannel,
  type Assistant,
  type ChannelPlatformId,
  type ChannelRuntimeStatus,
  type ImChannelConfigPublic,
} from '@toolman/shared'
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

  useEffect(() => {
    setDraft(config)
    setAppSecret('')
    setEncryptKey('')
    setTestMessage(null)
  }, [config])

  const platformName =
    CHANNEL_PLATFORMS.find((item) => item.id === draft.platform)?.name ?? draft.platform

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-channel-modal tm-settings-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">{platformName} 频道配置</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="tm-modal-body">
          <div className="tm-form-field tm-channel-enable-row">
            <label className="tm-form-label">启用频道</label>
            <SettingsToggle
              checked={draft.enabled}
              onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">回调地址</label>
            {draft.platform === 'discord' ? (
              <p className="tm-add-agent-hint">
                Discord 通过 Bot Gateway 长连接接收消息，将 Bot Token 填入「应用密钥」即可。
              </p>
            ) : draft.platform === 'dingtalk' ? (
              <p className="tm-add-agent-hint">
                钉钉通过 Stream 长连接接收消息。在开发者后台启用机器人并选择 Stream 模式，将 AppKey
                填入「应用 ID」、AppSecret 填入「应用密钥」。
              </p>
            ) : draft.platform === 'feishu' ? (
              <>
                <SettingsInput value={webhookPath} disabled onChange={() => {}} />
                <p className="tm-add-agent-hint">
                  在飞书开发者后台 → 事件订阅，将请求地址配置为上述 URL，并订阅「接收消息」事件。
                </p>
              </>
            ) : draft.platform === 'wechat' ? (
              <>
                <SettingsInput value={webhookPath} disabled onChange={() => {}} />
                <p className="tm-add-agent-hint">
                  在企业微信开发者后台配置回调 URL，填写 Token 与 EncodingAESKey，并在「域名」字段填写应用
                  AgentId。
                </p>
              </>
            ) : (
              <p className="tm-add-agent-hint">该平台运行时适配即将推出，可先保存配置。</p>
            )}
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">频道名称</label>
            <SettingsInput
              value={draft.name}
              onChange={(name) => setDraft((prev) => ({ ...prev, name }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">绑定智能体</label>
            <SettingsSelect
              value={draft.assistantId || ''}
              options={[
                { value: '', label: '请选择智能体' },
                ...assistants.map((assistant) => ({
                  value: assistant.id,
                  label: assistant.name,
                })),
              ]}
              onChange={(assistantId) => setDraft((prev) => ({ ...prev, assistantId }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">应用 ID</label>
            <SettingsInput
              value={draft.appId}
              onChange={(appId) => setDraft((prev) => ({ ...prev, appId }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">
              应用密钥
              {draft.platform === 'discord'
                ? '（Bot Token）'
                : draft.platform === 'dingtalk'
                  ? '（AppSecret）'
                  : draft.platform === 'wechat'
                    ? '（CorpSecret）'
                    : ''}
            </label>
            <SettingsInput
              type="password"
              value={appSecret}
              placeholder={draft.hasAppSecret ? '已保存，留空则不修改' : ''}
              onChange={setAppSecret}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">加密密钥</label>
            <SettingsInput
              type="password"
              value={encryptKey}
              placeholder={draft.hasEncryptKey ? '已保存，留空则不修改' : ''}
              onChange={setEncryptKey}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">验证令牌</label>
            <SettingsInput
              value={draft.verificationToken}
              onChange={(verificationToken) => setDraft((prev) => ({ ...prev, verificationToken }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">域名</label>
            <SettingsInput
              value={draft.domain}
              placeholder={
                draft.platform === 'feishu'
                  ? '飞书（中国）'
                  : draft.platform === 'wechat'
                    ? '应用 AgentId（数字）'
                    : '默认'
              }
              onChange={(domain) => setDraft((prev) => ({ ...prev, domain }))}
            />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">允许的聊天 ID</label>
            <SettingsInput
              value={draft.allowedChatIds}
              placeholder="留空表示不限制，多个 ID 用逗号分隔"
              onChange={(allowedChatIds) => setDraft((prev) => ({ ...prev, allowedChatIds }))}
            />
            <p className="tm-add-agent-hint">可填写群聊或单聊 ID，留空则响应所有会话。</p>
          </div>

          {testMessage ? <div className="tm-settings-error">{testMessage}</div> : null}
        </div>

        <div className="tm-modal-footer">
          <div className="tm-form-actions">
            <button type="button" className="tm-btn" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="tm-btn"
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
              className="tm-btn tm-btn--primary"
              onClick={() =>
                onSave({
                  ...draft,
                  ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
                  ...(encryptKey.trim() ? { encryptKey: encryptKey.trim() } : {}),
                })
              }
            >
              保存
            </button>
          </div>
        </div>
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
