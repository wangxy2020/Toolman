import { useEffect, useState } from 'react'
import { Alert, Platform, Share, Text, View } from 'react-native'
import { saveModulePrefs, type NotesOpenMode } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import {
  parseNotesBackup,
  saveNotesStore,
  serializeNotesBackup,
} from '../storage/notes'
import { SettingsDialogFrame } from './SettingsDialogFrame'
import {
  SettingsChoiceRow,
  SettingsInlineButton,
  SettingsRangeSlider,
  SettingsSectionTitle,
  SettingsTextArea,
  fieldStyles,
} from './settingsModalFields'
import { Toggle, settingsUiStyles as styles } from './settingsUi'

type Props = {
  visible: boolean
  onClose: () => void
}

type SettingsTab = 'storage' | 'editor' | 'display'

const OPEN_MODE_OPTIONS: Array<{ id: NotesOpenMode; label: string }> = [
  { id: 'edit-only', label: '仅编辑' },
  { id: 'live-preview', label: '实时预览' },
  { id: 'preview-only', label: '预览模式' },
]

function pickJsonFile(): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null)
      }
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}

function downloadJson(filename: string, raw: string) {
  if (typeof document === 'undefined') return false
  const blob = new Blob([raw], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export function NotesSettingsModal({ visible, onClose }: Props) {
  const {
    modulePrefs,
    setModulePrefs,
    notebooks,
    notes,
    activeNoteId,
    deletedNotes,
    setNotebooks,
    setNotes,
    setActiveNoteId,
    setDeletedNotes,
  } = useMobileApp()
  const [activeTab, setActiveTab] = useState<SettingsTab>('storage')
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [autoSyncOnEdit, setAutoSyncOnEdit] = useState(true)
  const [openMode, setOpenMode] = useState<NotesOpenMode>('edit-only')
  const [showOutline, setShowOutline] = useState(true)
  const [narrowColumn, setNarrowColumn] = useState(false)
  const [fontSize, setFontSize] = useState(16)
  const [pasteJson, setPasteJson] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setActiveTab('storage')
    setSyncEnabled(modulePrefs.notes.syncEnabled)
    setAutoSyncOnEdit(modulePrefs.notes.autoSyncOnEdit)
    setOpenMode(modulePrefs.notes.openMode)
    setShowOutline(modulePrefs.notes.showOutline)
    setNarrowColumn(modulePrefs.notes.narrowColumn)
    setFontSize(modulePrefs.notes.fontSize)
    setPasteJson('')
    setShowPaste(false)
    setNotice(null)
  }, [visible, modulePrefs.notes])

  const applyBackup = async (raw: string) => {
    const store = parseNotesBackup(raw)
    if (!store) {
      setNotice('无法解析笔记 JSON')
      return
    }
    setNotebooks(store.notebooks)
    setNotes(store.notes)
    setActiveNoteId(store.activeNoteId)
    setDeletedNotes(store.deletedNotes)
    await saveNotesStore(store)
    setPasteJson('')
    setShowPaste(false)
    setNotice(`已导入 ${store.notes.length} 篇笔记`)
  }

  const confirmImport = (raw: string) => {
    Alert.alert('导入笔记 JSON', '导入将覆盖当前所有笔记数据，是否继续？', [
      { text: '取消', style: 'cancel' },
      { text: '导入', style: 'destructive', onPress: () => void applyBackup(raw) },
    ])
  }

  const handleExport = async () => {
    const raw = serializeNotesBackup({ notebooks, notes, activeNoteId, deletedNotes })
    const filename = `toolman-notes-${new Date().toISOString().slice(0, 10)}.json`
    if (downloadJson(filename, raw)) {
      setNotice('已导出笔记 JSON')
      return
    }
    try {
      await Share.share({ message: raw, title: filename })
    } catch {
      setNotice('导出已取消')
    }
  }

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      const raw = await pickJsonFile()
      if (raw) confirmImport(raw)
      return
    }
    setShowPaste(true)
    setNotice('请粘贴导出的笔记 JSON 后确认导入')
  }

  const handleSave = async () => {
    const next = {
      ...modulePrefs,
      notes: {
        syncEnabled,
        autoSyncOnEdit,
        openMode,
        showOutline,
        narrowColumn,
        fontSize,
      },
    }
    setModulePrefs(next)
    await saveModulePrefs(next)
    onClose()
  }

  return (
    <SettingsDialogFrame
      visible={visible}
      title="笔记设置"
      tabs={[
        { id: 'storage', label: '存储与数据' },
        { id: 'editor', label: '编辑器设置' },
        { id: 'display', label: '显示与外观' },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as SettingsTab)}
      onClose={onClose}
      onSave={() => void handleSave()}
      saveLabel="保存设置"
    >
      {notice ? <Text style={styles.hint}>{notice}</Text> : null}

      {activeTab === 'storage' ? (
        <>
          <SettingsSectionTitle>数据设置</SettingsSectionTitle>
          <Text style={styles.hint}>当前工作目录</Text>
          <Text style={styles.hint}>本机应用存储（SecureStore / 浏览器本地存储）</Text>
          <Text style={styles.hint}>
            移动端没有桌面级工作目录。笔记保存在本机，并通过桌面 Sync Hub（端口 17890）与同账户桌面端同步。
          </Text>
          <Toggle label="与桌面端同步笔记" value={syncEnabled} onChange={setSyncEnabled} />
          <Toggle label="编辑后自动上传" value={autoSyncOnEdit} onChange={setAutoSyncOnEdit} />
          <Text style={styles.hint}>打开应用时同步一次，之后约每 3 分钟检查有变化的笔记；也可手动同步。编辑后会尝试上传，失败会在下次定时同步重试。</Text>
          <SettingsSectionTitle>数据备份</SettingsSectionTitle>
          <View style={fieldStyles.actionRow}>
            <SettingsInlineButton label="导出笔记 JSON" onPress={() => void handleExport()} />
            <SettingsInlineButton label="导入笔记 JSON" onPress={() => void handleImport()} />
          </View>
          <Text style={styles.hint}>笔记保存在本机，建议定期导出备份。</Text>
          {showPaste ? (
            <>
              <SettingsTextArea
                label="粘贴 JSON"
                value={pasteJson}
                onChangeText={setPasteJson}
                minHeight={120}
              />
              <SettingsInlineButton label="确认导入" onPress={() => confirmImport(pasteJson)} />
            </>
          ) : null}
        </>
      ) : null}

      {activeTab === 'editor' ? (
        <>
          <SettingsSectionTitle>默认打开模式</SettingsSectionTitle>
          <SettingsChoiceRow
            value={openMode}
            options={OPEN_MODE_OPTIONS}
            onChange={(id) => setOpenMode(id as NotesOpenMode)}
          />
          <Text style={styles.hint}>
            打开笔记时的默认视图：仅编辑、左右实时预览，或纯预览模式。
          </Text>
        </>
      ) : null}

      {activeTab === 'display' ? (
        <>
          <SettingsSectionTitle>显示与外观</SettingsSectionTitle>
          <Toggle label="显示大纲" value={showOutline} onChange={setShowOutline} />
          <Text style={styles.hint}>在笔记编辑区右侧显示标题大纲。</Text>
          <Toggle label="缩减栏宽" value={narrowColumn} onChange={setNarrowColumn} />
          <Text style={styles.hint}>开启后将限制每行字数，使屏幕显示的内容更聚焦。</Text>
          <SettingsRangeSlider
            label="字体大小"
            value={fontSize}
            unit="px"
            min={10}
            max={30}
            onChange={setFontSize}
          />
        </>
      ) : null}
    </SettingsDialogFrame>
  )
}
