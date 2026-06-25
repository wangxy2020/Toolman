export type NotesSlashAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'task'
  | 'code'
  | 'codeblock'
  | 'image'
  | 'link'
  | 'table'
  | 'math'
  | 'divider'

export interface NotesSlashCommandItem {
  id: string
  command: string
  description: string
  action: NotesSlashAction
}

export const NOTES_SLASH_COMMANDS: NotesSlashCommandItem[] = [
  { id: 'h1', command: '/h1', description: '一级标题', action: 'h1' },
  { id: 'h2', command: '/h2', description: '二级标题', action: 'h2' },
  { id: 'h3', command: '/h3', description: '三级标题', action: 'h3' },
  { id: 'body', command: '/正文', description: '正文样式', action: 'body' },
  { id: 'bullet', command: '/列表', description: '无序列表', action: 'bullet' },
  { id: 'ordered', command: '/编号', description: '有序列表', action: 'ordered' },
  { id: 'task', command: '/待办', description: '任务清单', action: 'task' },
  { id: 'quote', command: '/引用', description: '引用块', action: 'quote' },
  { id: 'code', command: '/代码', description: '行内代码', action: 'code' },
  { id: 'codeblock', command: '/代码块', description: '代码块', action: 'codeblock' },
  { id: 'image', command: '/图片', description: '插入图片', action: 'image' },
  { id: 'link', command: '/链接', description: '插入链接', action: 'link' },
  { id: 'table', command: '/表格', description: '插入表格', action: 'table' },
  { id: 'math', command: '/公式', description: '插入公式', action: 'math' },
  { id: 'divider', command: '/分隔', description: '分隔线', action: 'divider' },
]

export function filterNotesSlashCommands(
  query: string,
  commands: NotesSlashCommandItem[],
): NotesSlashCommandItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized.startsWith('/')) return commands
  if (normalized === '/') return commands
  return commands.filter(
    (item) =>
      item.command.toLowerCase().startsWith(normalized) ||
      item.description.toLowerCase().includes(normalized.slice(1)),
  )
}
