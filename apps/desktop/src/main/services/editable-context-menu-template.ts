export type EditableContextMenuParams = {
  isEditable: boolean
  selectionText?: string
  editFlags?: {
    canUndo?: boolean
    canRedo?: boolean
    canCut?: boolean
    canCopy?: boolean
    canPaste?: boolean
    canSelectAll?: boolean
  }
}

export type EditableContextMenuItem =
  | { role: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'; enabled: boolean }
  | { type: 'separator' }

export function shouldAttachEditableContextMenu(contentsUrl: string): boolean {
  return !contentsUrl.startsWith('devtools://')
}

/** Native cut/copy/paste for inputs, textareas, and contenteditable fields. */
export function buildEditableContextMenuTemplate(
  params: EditableContextMenuParams,
): EditableContextMenuItem[] | null {
  const flags = params.editFlags ?? {}

  if (params.isEditable) {
    return [
      { role: 'undo', enabled: Boolean(flags.canUndo) },
      { role: 'redo', enabled: Boolean(flags.canRedo) },
      { type: 'separator' },
      { role: 'cut', enabled: Boolean(flags.canCut) },
      { role: 'copy', enabled: Boolean(flags.canCopy) },
      { role: 'paste', enabled: Boolean(flags.canPaste) },
      { type: 'separator' },
      { role: 'selectAll', enabled: Boolean(flags.canSelectAll) },
    ]
  }

  if (params.selectionText?.trim()) {
    return [
      { role: 'copy', enabled: flags.canCopy !== false },
      { role: 'selectAll', enabled: Boolean(flags.canSelectAll) },
    ]
  }

  return null
}
