export interface NoteTemplate {
  id: string
  name: string
  description: string
  title: string
  content: string
  tags: string[]
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'blank',
    name: '空白笔记',
    description: '从零开始书写',
    title: '',
    content: '',
    tags: [],
  },
  {
    id: 'daily',
    name: '日记',
    description: '记录今日见闻与心情',
    title: '日记',
    content: '## 今日概览\n\n\n## 收获\n\n\n## 待办\n\n- [ ] ',
    tags: ['日记'],
  },
  {
    id: 'meeting',
    name: '会议纪要',
    description: '会议时间、议题与行动项',
    title: '会议纪要',
    content:
      '## 基本信息\n\n- 时间：\n- 参与人：\n\n## 议题\n\n1. \n\n## 结论\n\n\n## 行动项\n\n- [ ] 负责人：',
    tags: ['会议'],
  },
  {
    id: 'project',
    name: '项目笔记',
    description: '目标、里程碑与风险',
    title: '项目笔记',
    content: '## 项目目标\n\n\n## 里程碑\n\n- [ ] \n\n## 风险\n\n\n## 相关资料\n\n- [[相关笔记]]',
    tags: ['项目'],
  },
  {
    id: 'reading',
    name: '读书笔记',
    description: '摘录、思考与行动',
    title: '读书笔记',
    content: '## 书籍信息\n\n- 书名：\n- 作者：\n\n## 摘录\n\n> \n\n## 思考\n\n\n## 行动\n\n- [ ] ',
    tags: ['读书'],
  },
]

export function getNoteTemplate(id: string): NoteTemplate | null {
  return NOTE_TEMPLATES.find((item) => item.id === id) ?? null
}
