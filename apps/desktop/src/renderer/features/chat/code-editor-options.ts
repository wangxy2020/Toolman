export type CodeEditorId = 'vscode' | 'cursor' | 'zed' | 'idea' | 'sublime'

export interface CodeEditorOption {
  id: CodeEditorId
  label: string
}

export const CODE_EDITOR_OPTIONS: CodeEditorOption[] = [
  { id: 'vscode', label: 'Visual Studio Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'zed', label: 'Zed' },
  { id: 'idea', label: 'IntelliJ IDEA' },
  { id: 'sublime', label: 'Sublime Text' },
]

export const DEFAULT_CODE_EDITOR: CodeEditorId = 'vscode'

export function getCodeEditorId(workspaceSettings: Record<string, unknown> | undefined): CodeEditorId {
  const value = workspaceSettings?.codeEditor
  if (typeof value === 'string' && CODE_EDITOR_OPTIONS.some((opt) => opt.id === value)) {
    return value as CodeEditorId
  }
  return DEFAULT_CODE_EDITOR
}

export function getCodeEditorLabel(id: CodeEditorId): string {
  return CODE_EDITOR_OPTIONS.find((opt) => opt.id === id)?.label ?? 'Visual Studio Code'
}
