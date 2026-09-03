import { describe, expect, it } from 'vitest'

import {
  buildEditableContextMenuTemplate,
  shouldAttachEditableContextMenu,
} from './editable-context-menu-template'

describe('editable context menu', () => {
  it('skips DevTools contents', () => {
    expect(shouldAttachEditableContextMenu('devtools://devtools/bundled/devtools_app.html')).toBe(
      false,
    )
    expect(shouldAttachEditableContextMenu('http://localhost:5173/')).toBe(true)
  })

  it('builds cut/copy/paste for editable fields', () => {
    expect(
      buildEditableContextMenuTemplate({
        isEditable: true,
        editFlags: {
          canUndo: true,
          canRedo: false,
          canCut: true,
          canCopy: true,
          canPaste: true,
          canSelectAll: true,
        },
      }),
    ).toEqual([
      { role: 'undo', enabled: true },
      { role: 'redo', enabled: false },
      { type: 'separator' },
      { role: 'cut', enabled: true },
      { role: 'copy', enabled: true },
      { role: 'paste', enabled: true },
      { type: 'separator' },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('offers copy for selected text outside inputs', () => {
    expect(
      buildEditableContextMenuTemplate({
        isEditable: false,
        selectionText: 'copied from a message',
        editFlags: { canCopy: true, canSelectAll: true },
      }),
    ).toEqual([
      { role: 'copy', enabled: true },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('does not steal custom list/file context menus', () => {
    expect(
      buildEditableContextMenuTemplate({
        isEditable: false,
        selectionText: '',
      }),
    ).toBeNull()
  })
})
