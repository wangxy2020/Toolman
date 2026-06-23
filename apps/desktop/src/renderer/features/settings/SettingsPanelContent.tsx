import { useCallback } from 'react'
import type { MessageSettings } from '../chat/message-settings'
import type { AppSettings } from './app-settings'
import { DataSettingsPanel } from './DataSettingsPanel'
import { ChannelsSettingsPanel } from './ChannelsSettingsPanel'
import { McpSettingsPanel } from './McpSettingsPanel'
import { SkillsSettingsPanel } from './SkillsSettingsPanel'
import { AboutSettingsPanel } from './AboutSettingsPanel'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'
import { ModelServicePanel } from './ModelServicePanel'
import {
  SettingsInput,
  SettingsPageLayout,
  SettingsPlaceholder,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
} from './SettingsShared'
import type { SettingsSectionId } from './settings-nav'
import { QuickPhrasesSettingsPanel } from './QuickPhrasesSettingsPanel'
import { DiagnosticsSettingsPanel } from './DiagnosticsSettingsPanel'

interface Props {
  section: SettingsSectionId
  workspaceId: string | null
  appSettings: AppSettings
  messageSettings: MessageSettings
  onAppSettingsChange: (patch: Partial<AppSettings>) => void
  onMessageSettingsChange: (patch: Partial<MessageSettings>) => void
  onProvidersSaved?: () => void
}

const SHORTCUTS = [
  { keys: '⌘ + N', action: '新建会话' },
  { keys: '⌘ + K', action: '打开搜索' },
  { keys: '⌘ + ,', action: '打开设置' },
  { keys: '⌘ + Enter', action: '发送消息' },
  { keys: 'Esc', action: '关闭弹窗 / 取消' },
]

export function SettingsPanelContent({
  section,
  workspaceId,
  appSettings,
  messageSettings,
  onAppSettingsChange,
  onMessageSettingsChange,
  onProvidersSaved,
}: Props) {
  const patchApp = useCallback(
    (patch: Partial<AppSettings>) => onAppSettingsChange(patch),
    [onAppSettingsChange],
  )

  const content = (() => {
    switch (section) {
    case 'general':
      return (
        <SettingsPageLayout>
          <SettingsSection title="一般设置">
            <SettingsRow label="启动时恢复上次会话" hint="重新打开应用时自动回到上次的对话">
              <SettingsToggle
                checked={appSettings.restoreLastSession}
                onChange={(restoreLastSession) => patchApp({ restoreLastSession })}
              />
            </SettingsRow>
            <SettingsRow label="拼写检查" hint="在输入框中启用拼写检查">
              <SettingsToggle
                checked={appSettings.spellCheckEnabled}
                onChange={(spellCheckEnabled) => patchApp({ spellCheckEnabled })}
              />
            </SettingsRow>
          </SettingsSection>
        </SettingsPageLayout>
      )

    case 'display':
      return (
        <DisplaySettingsPanel
          appSettings={appSettings}
          messageSettings={messageSettings}
          onAppSettingsChange={onAppSettingsChange}
          onMessageSettingsChange={onMessageSettingsChange}
        />
      )

    case 'model-service':
      if (!workspaceId) {
        return <SettingsPlaceholder title="模型服务" description="正在加载工作区…" />
      }
      return <ModelServicePanel workspaceId={workspaceId} onSaved={onProvidersSaved} />

    case 'data':
      return <DataSettingsPanel />

    case 'mcp':
      return <McpSettingsPanel />

    case 'skills':
      return <SkillsSettingsPanel />

    case 'web-search':
      return (
        <SettingsSection title="网络搜索">
          <SettingsRow label="启用网络搜索" hint="允许智能体在对话中检索互联网信息">
            <SettingsToggle
              checked={appSettings.webSearchEnabled}
              onChange={(webSearchEnabled) => patchApp({ webSearchEnabled })}
            />
          </SettingsRow>
          <SettingsRow label="搜索提供商">
            <SettingsSelect
              value={appSettings.webSearchProvider}
              options={[
                { value: 'duckduckgo', label: 'DuckDuckGo' },
                { value: 'bing', label: 'Bing' },
                { value: 'google', label: 'Google' },
              ]}
              onChange={(webSearchProvider) => patchApp({ webSearchProvider })}
            />
          </SettingsRow>
        </SettingsSection>
      )

    case 'memory':
      return (
        <SettingsSection title="记忆">
          <SettingsRow label="启用长期记忆" hint="智能体可记住跨会话的偏好与上下文">
            <SettingsToggle
              checked={appSettings.memoryEnabled}
              onChange={(memoryEnabled) => patchApp({ memoryEnabled })}
            />
          </SettingsRow>
          <SettingsRow label="记忆保留天数">
            <SettingsInput
              type="number"
              min={1}
              value={appSettings.memoryRetentionDays}
              onChange={(v) => patchApp({ memoryRetentionDays: Number(v) || 30 })}
            />
          </SettingsRow>
        </SettingsSection>
      )

    case 'channels':
      return <ChannelsSettingsPanel workspaceId={workspaceId} />

    case 'documents':
      return (
        <SettingsSection title="文档处理">
          <SettingsRow
            label="OCR 识别"
            hint="扫描件 PDF 与图片（PNG/JPG 等）通过视觉模型提取文字；需在知识库设置中配置文档处理 Provider"
          >
            <SettingsToggle
              checked={appSettings.documentOcrEnabled}
              onChange={(documentOcrEnabled) => patchApp({ documentOcrEnabled })}
            />
          </SettingsRow>
          <SettingsRow label="PDF 解析">
            <span className="tm-settings-static">内置解析器</span>
          </SettingsRow>
        </SettingsSection>
      )

    case 'quick-phrases':
      return <QuickPhrasesSettingsPanel />

    case 'shortcuts':
      return (
        <SettingsSection title="快捷键">
          {SHORTCUTS.map((item) => (
            <div key={item.keys} className="tm-display-row">
              <span className="tm-settings-shortcut-keys">{item.keys}</span>
              <span className="tm-settings-shortcut-action">{item.action}</span>
            </div>
          ))}
        </SettingsSection>
      )

    case 'diagnostics':
      return <DiagnosticsSettingsPanel />

    case 'about':
      return <AboutSettingsPanel />

    default:
      return null
    }
  })()

  return <SettingsPageLayout>{content}</SettingsPageLayout>
}
