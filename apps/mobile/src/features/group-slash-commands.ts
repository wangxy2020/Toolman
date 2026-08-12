/** Align with desktop `slash-commands.ts` group set. */
export type SlashCommandItem = {
  id: string
  command: string
  description: string
  insert?: string
  action?: 'clear'
}

export const GROUP_SLASH_COMMANDS: SlashCommandItem[] = [
  { id: 'clear', command: '/clear', description: '清空本页自己的消息', action: 'clear' },
  {
    id: 'summarize',
    command: '/summarize',
    description: '总结以上对话内容',
    insert: '请总结以上对话内容。',
  },
  {
    id: 'explain',
    command: '/explain',
    description: '详细解释以上内容',
    insert: '请详细解释以上内容。',
  },
  {
    id: 'translate',
    command: '/translate',
    description: '翻译以上内容',
    insert: '请将以上内容翻译成中文。',
  },
]
