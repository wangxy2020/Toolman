import { useEffect, useMemo, useState } from 'react'
import type { GroupWorkspace } from '../storage/groupChat'

export type GroupSettingsTab = 'general' | 'storage' | 'danger'

export const GROUP_SETTINGS_TABS: Array<{ id: GroupSettingsTab; label: string }> = [
  { id: 'general', label: '基本信息' },
  { id: 'storage', label: '存储与同步' },
  { id: 'danger', label: '危险操作' },
]

export type GroupSettingsModalProps = {
  visible: boolean
  group: GroupWorkspace | null
  memberCount: number
  onClose: () => void
  onSave: (input: { name: string; description?: string }) => void
  onDissolve: () => void
}

export function isGroupSettingsDirty(
  group: GroupWorkspace | null,
  name: string,
  description: string,
): boolean {
  if (!group) return false
  return name.trim() !== group.name || description.trim() !== (group.description ?? '')
}

export function buildGroupSettingsSave(
  name: string,
  description: string,
): { input: { name: string; description?: string } } | { error: string } {
  const trimmedName = name.trim()
  if (!trimmedName) return { error: '群组名称不能为空' }
  return {
    input: {
      name: trimmedName,
      description: description.trim() || undefined,
    },
  }
}

export function useGroupSettingsModal(props: GroupSettingsModalProps) {
  const { visible, group, onSave } = props
  const [activeTab, setActiveTab] = useState<GroupSettingsTab>('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  useEffect(() => {
    if (!visible || !group) return
    setActiveTab('general')
    setName(group.name)
    setDescription(group.description ?? '')
    setError(null)
    setConfirmDissolve(false)
  }, [visible, group])

  const isDirty = useMemo(
    () => isGroupSettingsDirty(group, name, description),
    [description, group, name],
  )

  const handleSave = () => {
    const result = buildGroupSettingsSave(name, description)
    if ('error' in result) {
      setError(result.error)
      setActiveTab('general')
      return
    }
    setError(null)
    onSave(result.input)
  }

  const changeName = (value: string) => {
    setName(value)
    setError(null)
  }

  return {
    activeTab,
    setActiveTab,
    name,
    changeName,
    description,
    setDescription,
    error,
    confirmDissolve,
    setConfirmDissolve,
    isDirty,
    handleSave,
  }
}
