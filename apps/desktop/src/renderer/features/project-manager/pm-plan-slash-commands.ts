import type { SlashCommandItem } from '../chat/slash-commands'

export const PM_PLAN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'pm-wbs',
    command: '/wbs',
    description: '生成 WBS 建议（JSON）',
    insert: '/wbs',
  },
  {
    id: 'pm-schedule',
    command: '/schedule',
    description: '自动排期建议',
    insert: '/schedule',
  },
  {
    id: 'pm-resource',
    command: '/resource',
    description: '任务资源用量建议',
    insert: '/resource',
  },
  {
    id: 'pm-forecast',
    command: '/forecast',
    description: '成本预测分析',
    insert: '/forecast',
  },
  {
    id: 'pm-catalog',
    command: '/catalog',
    description: '检查资源列表',
    insert: '/catalog',
  },
  {
    id: 'pm-daily',
    command: '/daily',
    description: '生成项目日报',
    insert: '/daily',
  },
  {
    id: 'pm-weekly',
    command: '/weekly',
    description: '生成项目周报',
    insert: '/weekly',
  },
  {
    id: 'pm-monthly',
    command: '/monthly',
    description: '生成项目月报',
    insert: '/monthly',
  },
]
