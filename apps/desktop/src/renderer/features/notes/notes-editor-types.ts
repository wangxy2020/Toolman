export type NotesEditorPreviewMode = 'edit' | 'preview'

export type NotesEditorSnapshot = {
  title: string
  content: string
}

export function toggleNoteTaskLine(lines: string[], lineIndex: number, checked: boolean): string | null {
  let taskCounter = -1
  for (let i = 0; i < lines.length; i++) {
    if (!/^- \[[ xX]\] /.test(lines[i])) continue
    taskCounter += 1
    if (taskCounter !== lineIndex) continue
    lines[i] = checked
      ? lines[i].replace(/^- \[ \] /, '- [x] ')
      : lines[i].replace(/^- \[[xX]\] /, '- [ ] ')
    return lines.join('\n')
  }
  return null
}
