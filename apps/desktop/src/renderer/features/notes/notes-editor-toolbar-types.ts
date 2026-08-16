import type { ReactNode } from 'react'
import type { NotesToolbarFormatState } from './notes-rich-editor'

export type NoteToolbarActionKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'clearFormat'
  | 'fontSize'
  | 'body'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'image'
  | 'codeblock'
  | 'quote'
  | 'task'
  | 'math'
  | 'table'
  | 'link'

export type NotesEditorToolbarItem = {
  key: NoteToolbarActionKey
  title: string
  label: ReactNode
  variant?: 'text' | 'icon' | 'heading' | 'body'
  dividerAfter?: boolean
  async?: boolean
  activeKey?: keyof NotesToolbarFormatState
}

export interface NotesEditorToolbarProps {
  disabled?: boolean
  formatState?: NotesToolbarFormatState
  onRunAction: (key: NoteToolbarActionKey, options?: { fontSizePx?: number }) => void
  onRunImage: () => void | Promise<void>
  onRunLink: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  showOutline?: boolean
  onToggleOutline?: () => void
}

export type NotesEditorToolbarTipProps = (text: string) => Record<string, unknown>
