import type { ReactNode } from 'react'
import type { NoteToolbarActionKey } from '../features/notes/NotesEditorToolbar'
import type {
  NotesSlashAction,
  NotesSlashCommandItem,
} from '../features/notes/notes-slash-commands'
import type { TranslateFn } from './I18nProvider'

export function getNotesToolbarTitles(t: TranslateFn): Record<NoteToolbarActionKey, string> {
  return {
    bold: t('notesPage.editor.toolbar.bold'),
    italic: t('notesPage.editor.toolbar.italic'),
    underline: t('notesPage.editor.toolbar.underline'),
    strike: t('notesPage.editor.toolbar.strike'),
    code: t('notesPage.editor.toolbar.code'),
    body: t('notesPage.editor.toolbar.body'),
    h1: t('notesPage.editor.toolbar.h1'),
    h2: t('notesPage.editor.toolbar.h2'),
    h3: t('notesPage.editor.toolbar.h3'),
    bullet: t('notesPage.editor.toolbar.bullet'),
    ordered: t('notesPage.editor.toolbar.ordered'),
    image: t('notesPage.editor.toolbar.image'),
    codeblock: t('notesPage.editor.toolbar.codeblock'),
    quote: t('notesPage.editor.toolbar.quote'),
    task: t('notesPage.editor.toolbar.task'),
    math: t('notesPage.editor.toolbar.math'),
    table: t('notesPage.editor.toolbar.table'),
    link: t('notesPage.editor.toolbar.link'),
  }
}

export function getNotesSlashCommands(t: TranslateFn): NotesSlashCommandItem[] {
  const descriptions: Record<NotesSlashAction, string> = {
    h1: t('notesPage.editor.slash.h1'),
    h2: t('notesPage.editor.slash.h2'),
    h3: t('notesPage.editor.slash.h3'),
    body: t('notesPage.editor.slash.body'),
    bullet: t('notesPage.editor.slash.bullet'),
    ordered: t('notesPage.editor.slash.ordered'),
    task: t('notesPage.editor.slash.task'),
    quote: t('notesPage.editor.slash.quote'),
    code: t('notesPage.editor.slash.code'),
    codeblock: t('notesPage.editor.slash.codeblock'),
    image: t('notesPage.editor.slash.image'),
    link: t('notesPage.editor.slash.link'),
    table: t('notesPage.editor.slash.table'),
    math: t('notesPage.editor.slash.math'),
    divider: t('notesPage.editor.slash.divider'),
  }

  return [
    { id: 'h1', command: '/h1', description: descriptions.h1, action: 'h1' },
    { id: 'h2', command: '/h2', description: descriptions.h2, action: 'h2' },
    { id: 'h3', command: '/h3', description: descriptions.h3, action: 'h3' },
    { id: 'body', command: '/正文', description: descriptions.body, action: 'body' },
    { id: 'bullet', command: '/列表', description: descriptions.bullet, action: 'bullet' },
    { id: 'ordered', command: '/编号', description: descriptions.ordered, action: 'ordered' },
    { id: 'task', command: '/待办', description: descriptions.task, action: 'task' },
    { id: 'quote', command: '/引用', description: descriptions.quote, action: 'quote' },
    { id: 'code', command: '/代码', description: descriptions.code, action: 'code' },
    { id: 'codeblock', command: '/代码块', description: descriptions.codeblock, action: 'codeblock' },
    { id: 'image', command: '/图片', description: descriptions.image, action: 'image' },
    { id: 'link', command: '/链接', description: descriptions.link, action: 'link' },
    { id: 'table', command: '/表格', description: descriptions.table, action: 'table' },
    { id: 'math', command: '/公式', description: descriptions.math, action: 'math' },
    { id: 'divider', command: '/分隔', description: descriptions.divider, action: 'divider' },
  ]
}

export type NotesToolbarItem = {
  key: NoteToolbarActionKey
  title: string
  label: ReactNode
  variant?: 'text' | 'icon' | 'heading' | 'body'
  dividerAfter?: boolean
  async?: boolean
}
