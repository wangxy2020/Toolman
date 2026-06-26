/** Default session title stored in DB for new agent topics (Chinese legacy value). */
export const DEFAULT_SESSION_TITLE = '新对话' as const

export function isDefaultSessionTitle(title: string): boolean {
  return title.trim() === DEFAULT_SESSION_TITLE
}
