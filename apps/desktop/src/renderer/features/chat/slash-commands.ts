export interface SlashCommandItem {
  id: string
  command: string
  description: string
  insert?: string
  action?: 'clear' | 'new-session' | 'toggle-web-search'
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  { id: 'clear', command: '/clear', description: '清空对话历史', action: 'clear' },
  { id: 'compact', command: '/compact', description: '压缩上下文，节省 token', insert: '请压缩并总结当前对话上下文。' },
  { id: 'context', command: '/context', description: '查看当前上下文占用情况', insert: '请说明当前对话上下文的使用情况。' },
  { id: 'new', command: '/new', description: '新建话题', action: 'new-session' },
  { id: 'summarize', command: '/summarize', description: '总结以上对话内容', insert: '请总结以上对话内容。' },
  { id: 'explain', command: '/explain', description: '详细解释以上内容', insert: '请详细解释以上内容。' },
  { id: 'translate', command: '/translate', description: '翻译以上内容', insert: '请将以上内容翻译成中文。' },
  { id: 'fix', command: '/fix', description: '找出并修复代码问题', insert: '请找出并修复代码中的问题。' },
  { id: 'search', command: '/search', description: '开启或关闭联网搜索', action: 'toggle-web-search' },
]
