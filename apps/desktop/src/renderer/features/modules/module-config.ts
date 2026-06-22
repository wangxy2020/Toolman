import type { ModuleView } from '../../types/app-view'

export interface ModulePageConfig {
  title: string
  addLabel: string
  headerSegments: string[]
  sidebarEmptyHint: string
  contentEmptyTitle: string
  contentEmptyHint: string
}

export const MODULE_PAGE_CONFIG: Record<ModuleView, ModulePageConfig> = {
  knowledge: {
    title: '知识库',
    addLabel: '添加知识库',
    headerSegments: ['全部知识库'],
    sidebarEmptyHint: '暂无知识库，点击上方添加',
    contentEmptyTitle: '知识库',
    contentEmptyHint: '选择或创建一个知识库，可导入文件或监听文件夹自动同步。',
  },
  notes: {
    title: '笔记',
    addLabel: '新建笔记本',
    headerSegments: ['全部笔记'],
    sidebarEmptyHint: '暂无笔记本，点击上方新建',
    contentEmptyTitle: '笔记',
    contentEmptyHint: '选择左侧笔记开始编辑，支持 Markdown、块编辑、双向链接与全文搜索。',
  },
  workflow: {
    title: '自动化',
    addLabel: '新建自动化',
    headerSegments: ['全部自动化'],
    sidebarEmptyHint: '暂无自动化，点击上方新建',
    contentEmptyTitle: '自动化',
    contentEmptyHint: '在此配置自动化任务与工作流，功能开发中。',
  },
  group: {
    title: '群组',
    addLabel: '创建群组',
    headerSegments: ['我创建的群组'],
    sidebarEmptyHint: '暂无群组，点击上方创建',
    contentEmptyTitle: '群组',
    contentEmptyHint: '在此协作与群组对话，功能开发中。',
  },
  community: {
    title: '社区',
    addLabel: '探索社区',
    headerSegments: ['发现'],
    sidebarEmptyHint: '暂无订阅，点击上方探索',
    contentEmptyTitle: '社区',
    contentEmptyHint: '在此浏览与分享智能体，功能开发中。',
  },
}

export function getModulePageConfig(view: ModuleView): ModulePageConfig {
  return MODULE_PAGE_CONFIG[view]
}
