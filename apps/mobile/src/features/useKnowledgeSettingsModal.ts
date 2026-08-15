import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_KNOWLEDGE_WATCH_CONFIG,
  KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER,
} from '@toolman/shared'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import {
  DEFAULT_FOLDER_LABEL,
  DEFAULT_LOCAL_FOLDER_ID,
  DEFAULT_NETWORK_FOLDER_ID,
  DEFAULT_SYNC_FOLDER_ID,
  isSystemDefaultFolderName,
} from './knowledgeSidebar'
import { useOptionalKnowledgeUi } from './KnowledgePanes'
import {
  knowledgeSettingsTabs,
  knowledgeSettingsTitle,
  parseUrlRefreshIntervalHours,
  parseWatchDebounceMs,
  resolveKnowledgeSettingsKind,
  type KnowledgeSettingsTab,
} from './knowledgeSettingsUtils'

export type KnowledgeSettingsModalProps = {
  visible: boolean
  onClose: () => void
}

export function useKnowledgeSettingsModal(props: KnowledgeSettingsModalProps) {
  const { visible, onClose } = props
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const knowledgeUi = useOptionalKnowledgeUi()
  const [activeTab, setActiveTab] = useState<KnowledgeSettingsTab>('basic')
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [preferDesktopIndex, setPreferDesktopIndex] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [networkUrl, setNetworkUrl] = useState('')
  const [watchInclude, setWatchInclude] = useState('')
  const [watchExclude, setWatchExclude] = useState('')
  const [watchDebounceMs, setWatchDebounceMs] = useState('')
  const [urlRefreshIntervalHours, setUrlRefreshIntervalHours] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createdKb = useMemo(() => {
    if (!knowledgeUi?.activeKbId) return null
    return knowledgeUi.createdKbs.find((item) => item.id === knowledgeUi.activeKbId) ?? null
  }, [knowledgeUi])

  const syncedKb = useMemo(() => {
    if (!knowledgeUi?.activeKbId) return null
    return knowledgeUi.syncedKbs.find((item) => item.id === knowledgeUi.activeKbId) ?? null
  }, [knowledgeUi])

  const isDefaultFolder =
    knowledgeUi?.activeKbId === DEFAULT_SYNC_FOLDER_ID ||
    knowledgeUi?.activeKbId === DEFAULT_LOCAL_FOLDER_ID ||
    knowledgeUi?.activeKbId === DEFAULT_NETWORK_FOLDER_ID ||
    isSystemDefaultFolderName(knowledgeUi?.activeKbName ?? '')

  const kind = resolveKnowledgeSettingsKind({
    createdKb,
    syncedKb,
    activeSection: knowledgeUi?.activeSection,
  })

  const isLocalKb = kind === 'local'
  const isNetworkKb = kind === 'network'
  const isCreated = createdKb != null
  const nameReadOnly = !isCreated || isDefaultFolder
  const canEditWatch = isCreated && !isDefaultFolder
  const tabs = useMemo(() => knowledgeSettingsTabs(isLocalKb, isNetworkKb), [isLocalKb, isNetworkKb])
  const title = knowledgeSettingsTitle(kind)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    setError(null)
    setSyncEnabled(modulePrefs.knowledge.syncEnabled)
    setPreferDesktopIndex(modulePrefs.knowledge.preferDesktopIndex)
    setName(createdKb?.name ?? knowledgeUi?.activeKbName ?? DEFAULT_FOLDER_LABEL)
    setDescription(createdKb?.description ?? '')
    setNetworkUrl(createdKb?.networkUrl ?? '')
    setWatchInclude(createdKb?.watchInclude ?? KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER)
    setWatchExclude(createdKb?.watchExclude ?? DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude.join('\n'))
    setWatchDebounceMs(
      createdKb?.watchDebounceMs != null
        ? String(createdKb.watchDebounceMs)
        : String(DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs),
    )
    setUrlRefreshIntervalHours(
      createdKb?.urlRefreshIntervalHours != null
        ? String(createdKb.urlRefreshIntervalHours)
        : String(DEFAULT_KNOWLEDGE_WATCH_CONFIG.urlRefreshIntervalHours),
    )
  }, [visible, modulePrefs.knowledge, createdKb, knowledgeUi?.activeKbName])

  useEffect(() => {
    if (tabs.some((tab) => tab.id === activeTab)) return
    setActiveTab('basic')
  }, [activeTab, tabs])

  const handleSave = async () => {
    const nextPrefs = {
      ...modulePrefs,
      knowledge: { syncEnabled, preferDesktopIndex },
    }
    setModulePrefs(nextPrefs)
    await saveModulePrefs(nextPrefs)

    if (isCreated && createdKb) {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setError('请输入知识库名称')
        setActiveTab('basic')
        return
      }
      knowledgeUi?.updateCreatedKnowledgeBase(createdKb.id, {
        name: trimmedName,
        description: description.trim() || undefined,
        networkUrl: isNetworkKb ? networkUrl.trim() || createdKb.networkUrl : createdKb.networkUrl,
        watchInclude: watchInclude.trim() || undefined,
        watchExclude: watchExclude.trim() || undefined,
        watchDebounceMs: parseWatchDebounceMs(watchDebounceMs),
        urlRefreshIntervalHours: parseUrlRefreshIntervalHours(urlRefreshIntervalHours),
      })
    }
    onClose()
  }

  return {
    knowledgeUi,
    activeTab,
    setActiveTab,
    syncEnabled,
    setSyncEnabled,
    preferDesktopIndex,
    setPreferDesktopIndex,
    name,
    setName,
    description,
    setDescription,
    networkUrl,
    setNetworkUrl,
    watchInclude,
    setWatchInclude,
    watchExclude,
    setWatchExclude,
    watchDebounceMs,
    setWatchDebounceMs,
    urlRefreshIntervalHours,
    setUrlRefreshIntervalHours,
    error,
    isLocalKb,
    isNetworkKb,
    isCreated,
    nameReadOnly,
    canEditWatch,
    tabs,
    title,
    handleSave,
  }
}
