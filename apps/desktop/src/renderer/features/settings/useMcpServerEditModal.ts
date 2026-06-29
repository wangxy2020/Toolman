import { useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  type McpPromptInfo,
  type McpResourceInfo,
  type McpServerConfig,
  type McpToolInfo,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

export type McpServerEditModalTab = 'general' | 'tools' | 'prompts' | 'resources'

export function useMcpServerEditModal(draft: McpServerConfig, creating: boolean) {
  const { t } = useI18n()
  const [tab, setTab] = useState<McpServerEditModalTab>('general')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [tools, setTools] = useState<McpToolInfo[]>([])
  const [prompts, setPrompts] = useState<McpPromptInfo[]>([])
  const [resources, setResources] = useState<McpResourceInfo[]>([])

  useEffect(() => {
    setTab('general')
    setAdvancedOpen(false)
  }, [draft.id, creating])

  useEffect(() => {
    if (creating || !draft.id) {
      setTools([])
      setPrompts([])
      setResources([])
      return
    }

    let cancelled = false
    setInspectLoading(true)

    void window.api.invoke(IpcChannel.McpServerInspect, { id: draft.id }).then((result) => {
      if (cancelled) return
      setInspectLoading(false)
      if (!result.ok) return
      const data = result.data as {
        tools: McpToolInfo[]
        prompts: McpPromptInfo[]
        resources: McpResourceInfo[]
      }
      setTools(data.tools)
      setPrompts(data.prompts)
      setResources(data.resources)
    })

    return () => {
      cancelled = true
    }
  }, [draft.id, creating])

  const tabs = useMemo<Array<{ id: McpServerEditModalTab; label: string; count?: number }>>(
    () => [
      { id: 'general', label: t('settings.mcp.edit.tabs.general') },
      { id: 'tools', label: t('settings.mcp.edit.tabs.tools'), count: tools.length },
      { id: 'prompts', label: t('settings.mcp.edit.tabs.prompts'), count: prompts.length },
      { id: 'resources', label: t('settings.mcp.edit.tabs.resources'), count: resources.length },
    ],
    [prompts.length, resources.length, t, tools.length],
  )

  return {
    tab,
    setTab,
    advancedOpen,
    setAdvancedOpen,
    inspectLoading,
    tools,
    prompts,
    resources,
    tabs,
  }
}
