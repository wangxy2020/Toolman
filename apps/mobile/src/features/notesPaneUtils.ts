import type { MobileModuleId } from '../modules'
import type { SyncStatus } from '../state/MobileAppContext'
import type { NotesOpenMode } from '../settings/prefs'
import {
  DEFAULT_NOTEBOOK_ID,
  type MobileNote,
  type MobileNotebook,
} from '../storage/notes'
import type { ModulePanelStatusEntry } from './modulePageStatus'
import { extractNoteOutline, type NoteOutlineItem } from './noteBodyDisplay'

export type ContentModuleId = Exclude<
  MobileModuleId,
  'agent' | 'knowledge' | 'group' | 'community' | 'projects'
>

export type NotesRenameTarget = { kind: 'notebook' | 'note'; id: string }

export const MODULE_COPY: Record<
  ContentModuleId,
  {
    listTitle: string
    hint: string
    addLabel: string
    emptyHint: string
  }
> = {
  notes: {
    listTitle: '笔记',
    hint: '打开应用时同步一次，之后约每 3 分钟检查有变化的笔记。',
    addLabel: '新建笔记本',
    emptyHint: '暂无笔记本',
  },
  translate: {
    listTitle: '翻译任务',
    hint: '重 PDF 管线可在桌面完成；移动端负责任务列表与阅读。',
    addLabel: '新建对照',
    emptyHint: '暂无对照',
  },
  classroom: {
    listTitle: '课堂',
    hint: '打开应用时同步一次，之后约每 3 分钟检查有变化的课程。手机上课会回写到桌面。',
    addLabel: '开课',
    emptyHint: '暂无课堂',
  },
}

export function notebookSwipeId(id: string): string {
  return `notebook:${id}`
}

export function noteSwipeId(id: string): string {
  return `note:${id}`
}

export function groupNotesByNotebook(notes: MobileNote[]): Map<string, MobileNote[]> {
  const map = new Map<string, MobileNote[]>()
  for (const note of notes) {
    const list = map.get(note.notebookId) ?? []
    list.push(note)
    map.set(note.notebookId, list)
  }
  return map
}

export function seedExpandedNotebookId(
  notes: MobileNote[],
  activeNoteId: string | null,
  notebooks: Array<{ id: string }>,
): string {
  const active = notes.find((item) => item.id === activeNoteId)
  return active?.notebookId ?? notebooks[0]?.id ?? DEFAULT_NOTEBOOK_ID
}

export function findActiveNotebookId(
  notes: MobileNote[],
  activeNoteId: string | null,
): string | null {
  const active = notes.find((item) => item.id === activeNoteId)
  return active?.notebookId ?? null
}

export function resolveActiveNote(
  notes: MobileNote[],
  activeNoteId: string | null,
): MobileNote | null {
  return notes.find((item) => item.id === activeNoteId) ?? notes[0] ?? null
}

export function isProtectedNotebook(
  notebooks: Array<{ id: string; isDefault?: boolean }>,
  notebookId: string,
): boolean {
  return notebooks.some(
    (item) => item.id === notebookId && (item.isDefault || item.id === DEFAULT_NOTEBOOK_ID),
  )
}

export function applyNotebookRename(
  notebooks: MobileNotebook[],
  id: string,
  name: string,
): MobileNotebook[] {
  return notebooks.map((item) => (item.id === id ? { ...item, name } : item))
}

export function applyNoteRename(
  notes: MobileNote[],
  id: string,
  title: string,
  updatedAt = Date.now(),
): MobileNote[] {
  return notes.map((item) => (item.id === id ? { ...item, title, updatedAt } : item))
}

export function applyNotePatch(
  notes: MobileNote[],
  noteId: string,
  patch: Partial<MobileNote>,
  updatedAt = Date.now(),
): MobileNote[] {
  return notes.map((item) => (item.id === noteId ? { ...item, ...patch, updatedAt } : item))
}

export function notesAfterDelete(notes: MobileNote[], noteId: string): MobileNote[] {
  return notes.filter((item) => item.id !== noteId)
}

export function nextActiveNoteIdAfterNoteDelete(
  remaining: MobileNote[],
  deleted: MobileNote,
): string | null {
  const sameNotebook = remaining.find((item) => item.notebookId === deleted.notebookId)
  return sameNotebook?.id ?? remaining[0]?.id ?? null
}

export function notebooksAfterDelete(
  notebooks: MobileNotebook[],
  notebookId: string,
): MobileNotebook[] {
  return notebooks.filter((item) => item.id !== notebookId)
}

export function notesAfterNotebookDelete(
  notes: MobileNote[],
  notebookId: string,
): MobileNote[] {
  return notes.filter((item) => item.notebookId !== notebookId)
}

export function noteIdsInNotebook(notes: MobileNote[], notebookId: string): string[] {
  return notes.filter((item) => item.notebookId === notebookId).map((item) => item.id)
}

export function deleteNoteConfirmMessage(title: string): string {
  const display = title || '未命名笔记'
  return `确定删除「${display}」？此操作不可恢复。`
}

export function deleteNotebookConfirmMessage(name: string, count: number): string {
  return count > 0
    ? `确定删除「${name}」及其 ${count} 篇笔记？此操作不可恢复。`
    : `确定删除「${name}」？此操作不可恢复。`
}

export function countNoteChars(body: string): number {
  return Array.from(body).length
}

export function notesEditorLayoutFlags(
  notesPrefs: { showOutline: boolean; openMode: NotesOpenMode },
  outlineLength: number,
  width: number,
): {
  showOutline: boolean
  sideBySide: boolean
  showEditor: boolean
  showPreview: boolean
} {
  return {
    showOutline: notesPrefs.showOutline && outlineLength > 0 && width >= 720,
    sideBySide: notesPrefs.openMode === 'live-preview' && width >= 900,
    showEditor: notesPrefs.openMode !== 'preview-only',
    showPreview: notesPrefs.openMode !== 'edit-only',
  }
}

export function buildNotesPanelStatus(
  note: MobileNote | null,
  syncStatus: SyncStatus,
  charCount: number,
): ModulePanelStatusEntry {
  if (!note) return { tone: 'muted', message: '选择或新建笔记' }
  if (syncStatus === 'syncing') {
    return { tone: 'info', message: '正在同步笔记…', meta: `${charCount} 字` }
  }
  if (syncStatus === 'offline') {
    return { tone: 'warning', message: '未连接桌面，笔记仅保存在本地', meta: `${charCount} 字` }
  }
  if (syncStatus === 'error') {
    return { tone: 'error', message: '笔记同步失败', meta: `${charCount} 字` }
  }
  return { tone: 'muted', message: '就绪', meta: `${charCount} 字` }
}

export function noteOutline(note: MobileNote | null): NoteOutlineItem[] {
  return note ? extractNoteOutline(note.body) : []
}
