import type { McpPromptInfo, McpResourceInfo, McpToolInfo } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import type { McpServerEditModalTab } from './useMcpServerEditModal'

interface Props {
  tab: McpServerEditModalTab
  inspectLoading: boolean
  tools: McpToolInfo[]
  prompts: McpPromptInfo[]
  resources: McpResourceInfo[]
}

export function McpServerEditInspectTab({
  tab,
  inspectLoading,
  tools,
  prompts,
  resources,
}: Props) {
  const { t } = useI18n()

  if (tab === 'general') return null

  return (
    <div className="tm-mcp-inspect-panel">
      {tab === 'tools' ? (
        <div className="tm-mcp-inspect-list">
          {inspectLoading ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
          ) : null}
          {!inspectLoading && tools.length === 0 ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noTools')}</p>
          ) : null}
          {tools.map((tool) => (
            <div key={tool.name} className="tm-mcp-inspect-item">
              <div className="tm-mcp-inspect-name">{tool.name}</div>
              {tool.description ? (
                <div className="tm-mcp-inspect-desc">{tool.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'prompts' ? (
        <div className="tm-mcp-inspect-list">
          {inspectLoading ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
          ) : null}
          {!inspectLoading && prompts.length === 0 ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noPrompts')}</p>
          ) : null}
          {prompts.map((prompt) => (
            <div key={prompt.name} className="tm-mcp-inspect-item">
              <div className="tm-mcp-inspect-name">{prompt.name}</div>
              {prompt.description ? (
                <div className="tm-mcp-inspect-desc">{prompt.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'resources' ? (
        <div className="tm-mcp-inspect-list">
          {inspectLoading ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
          ) : null}
          {!inspectLoading && resources.length === 0 ? (
            <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noResources')}</p>
          ) : null}
          {resources.map((resource) => (
            <div key={resource.uri} className="tm-mcp-inspect-item">
              <div className="tm-mcp-inspect-name">{resource.name}</div>
              <div className="tm-mcp-inspect-uri">{resource.uri}</div>
              {resource.description ? (
                <div className="tm-mcp-inspect-desc">{resource.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
