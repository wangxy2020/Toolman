const STORAGE_KEY = 'toolman:notes-editor-settings'

export type NotesDefaultView = 'edit' | 'preview'
export type NotesDefaultEditView = 'edit' | 'preview'

export interface NotesEditorSettings {
  defaultView: NotesDefaultView
  defaultEditView: NotesDefaultEditView
  narrowColumn: boolean
  fontSize: number
  showOutline: boolean
}

export const DEFAULT_NOTES_EDITOR_SETTINGS: NotesEditorSettings = {
  defaultView: 'edit',
  defaultEditView: 'edit',
  narrowColumn: false,
  fontSize: 16,
  showOutline: true,
}

export const NOTES_DEFAULT_VIEW_OPTIONS: { value: NotesDefaultView; label: string }[] = [
  { value: 'edit', label: '编辑模式' },
  { value: 'preview', label: '预览模式' },
]

export const NOTES_DEFAULT_EDIT_VIEW_OPTIONS: { value: NotesDefaultEditView; label: string }[] = [
  { value: 'edit', label: '仅编辑' },
  { value: 'preview', label: '实时预览' },
]

/** Unified open mode shown in settings (maps to defaultView + defaultEditView). */
export type NotesOpenMode = 'edit-only' | 'live-preview' | 'preview-only'

export const NOTES_OPEN_MODE_OPTIONS: { value: NotesOpenMode; label: string }[] = [
  { value: 'edit-only', label: '仅编辑' },
  { value: 'live-preview', label: '实时预览' },
  { value: 'preview-only', label: '预览模式' },
]

export function notesOpenModeFromSettings(settings: NotesEditorSettings): NotesOpenMode {
  if (settings.defaultView === 'preview') return 'preview-only'
  if (settings.defaultEditView === 'preview') return 'live-preview'
  return 'edit-only'
}

export function settingsPatchFromNotesOpenMode(
  mode: NotesOpenMode,
): Pick<NotesEditorSettings, 'defaultView' | 'defaultEditView'> {
  switch (mode) {
    case 'preview-only':
      return { defaultView: 'preview', defaultEditView: 'preview' }
    case 'live-preview':
      return { defaultView: 'edit', defaultEditView: 'preview' }
    case 'edit-only':
      return { defaultView: 'edit', defaultEditView: 'edit' }
  }
}

export function resolveInitialPreviewMode(settings: NotesEditorSettings): NotesDefaultEditView {
  if (settings.defaultView === 'preview') return 'preview'
  return settings.defaultEditView
}

export function loadNotesEditorSettings(): NotesEditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_NOTES_EDITOR_SETTINGS
    const parsed = JSON.parse(raw) as Partial<NotesEditorSettings> & {
      previewByDefault?: boolean
      showOutline?: boolean
    }

    const rawDefaultEditView: string | undefined =
      parsed.defaultEditView ??
      (parsed.previewByDefault === true
        ? 'preview'
        : parsed.previewByDefault === false
          ? 'edit'
          : DEFAULT_NOTES_EDITOR_SETTINGS.defaultEditView)
    const defaultEditView: NotesDefaultEditView =
      rawDefaultEditView === 'split'
        ? 'edit'
        : rawDefaultEditView === 'preview' || rawDefaultEditView === 'edit'
          ? rawDefaultEditView
          : DEFAULT_NOTES_EDITOR_SETTINGS.defaultEditView

    return {
      defaultView:
        parsed.defaultView === 'preview' || parsed.defaultView === 'edit'
          ? parsed.defaultView
          : DEFAULT_NOTES_EDITOR_SETTINGS.defaultView,
      defaultEditView:
        defaultEditView === 'edit' || defaultEditView === 'preview'
          ? defaultEditView
          : DEFAULT_NOTES_EDITOR_SETTINGS.defaultEditView,
      narrowColumn: Boolean(parsed.narrowColumn),
      showOutline:
        typeof parsed.showOutline === 'boolean'
          ? parsed.showOutline
          : DEFAULT_NOTES_EDITOR_SETTINGS.showOutline,
      fontSize:
        typeof parsed.fontSize === 'number' && parsed.fontSize >= 10 && parsed.fontSize <= 30
          ? parsed.fontSize
          : DEFAULT_NOTES_EDITOR_SETTINGS.fontSize,
    }
  } catch {
    return DEFAULT_NOTES_EDITOR_SETTINGS
  }
}

export function saveNotesEditorSettings(settings: NotesEditorSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
