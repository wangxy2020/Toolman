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
