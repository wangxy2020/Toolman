import { useMemo, useState } from 'react'
import {
  IpcChannel,
  listSelectableAssistantLibPresets,
  type AssistantLibPresetId,
} from '@toolman/shared'
import { useI18n } from '../../../i18n/useI18n'
import {
  formatAssistantLibSelectedFiles,
  type AssistantLibTextbookSource,
} from '../assistant-lib-form-utils'
import {
  validateCreateCourseDraft,
  type AssistantLibCreateCourseInput,
} from '../assistant-lib-create-course-utils'

export type UseAssistantLibCreateCourseDialogProps = {
  defaultLocalFolderPath: string | null
  onStart: (input: AssistantLibCreateCourseInput) => void | Promise<void>
}

export function useAssistantLibCreateCourseDialog({
  defaultLocalFolderPath,
  onStart,
}: UseAssistantLibCreateCourseDialogProps) {
  const { t } = useI18n()
  const presets = useMemo(() => listSelectableAssistantLibPresets(), [])

  const [courseName, setCourseName] = useState('')
  const [presetId, setPresetId] = useState<AssistantLibPresetId>('socratic-tutor')
  const [textbookSource, setTextbookSource] = useState<AssistantLibTextbookSource>('knowledge')
  const [selectedKbId, setSelectedKbId] = useState('')
  const [selectedKbPath, setSelectedKbPath] = useState('')
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [kbPickerOpen, setKbPickerOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedPreset = presets.find((item) => item.id === presetId) ?? presets[0]

  const pathDisplay = useMemo(() => {
    if (textbookSource === 'local') return formatAssistantLibSelectedFiles(filePaths)
    return selectedKbPath
  }, [filePaths, selectedKbPath, textbookSource])

  const handleBrowse = async () => {
    setFormError(null)

    if (textbookSource === 'knowledge') {
      setKbPickerOpen(true)
      return
    }

    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: true,
      defaultPath: defaultLocalFolderPath ?? undefined,
    })
    if (!pickResult.ok) return
    const { paths } = pickResult.data as { paths: string[] }
    if (!paths?.length) return
    setFilePaths(paths)
  }

  const handleClearSelection = () => {
    if (textbookSource === 'knowledge') {
      setSelectedKbId('')
      setSelectedKbPath('')
    } else {
      setFilePaths([])
    }
    setFormError(null)
  }

  const handleSubmit = () => {
    const result = validateCreateCourseDraft({
      courseName,
      presetId: selectedPreset?.id ?? 'socratic-tutor',
      textbookSource,
      selectedKbId,
      filePaths,
    })
    if (!result.ok) {
      setFormError(t(result.errorKey))
      return
    }
    void onStart(result.input)
  }

  const hasSelection =
    textbookSource === 'knowledge' ? Boolean(selectedKbId || selectedKbPath) : filePaths.length > 0

  const selectTextbookSource = (source: AssistantLibTextbookSource) => {
    setTextbookSource(source)
    if (source === 'knowledge') {
      setFilePaths([])
    } else {
      setSelectedKbId('')
      setSelectedKbPath('')
    }
    setFormError(null)
  }

  const selectKnowledgeBase = (kbId: string, path: string) => {
    setSelectedKbId(kbId)
    setSelectedKbPath(path)
    setKbPickerOpen(false)
    setFormError(null)
  }

  return {
    t,
    presets,
    courseName,
    setCourseName,
    presetId,
    setPresetId,
    textbookSource,
    selectedKbId,
    filePaths,
    kbPickerOpen,
    setKbPickerOpen,
    formError,
    setFormError,
    selectedPreset,
    pathDisplay,
    hasSelection,
    handleBrowse,
    handleClearSelection,
    handleSubmit,
    selectTextbookSource,
    selectKnowledgeBase,
  }
}
