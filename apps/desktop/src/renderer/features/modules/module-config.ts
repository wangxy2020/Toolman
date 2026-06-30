import type { ModuleView } from '../../types/app-view'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { resolveModulePageConfig } from '../../i18n/module-page-labels'

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
    contentEmptyHint:
      '自动化与工作流功能即将上线。可在 设置 → 显示 → 隐藏的图标 中预先启用导航入口。',
  },
  group: {
    title: '群组',
    addLabel: '创建群组',
    headerSegments: ['我创建的群组'],
    sidebarEmptyHint: '暂无群组，点击上方创建',
    contentEmptyTitle: '群组',
    contentEmptyHint:
      '创建或加入群组，与成员协作共享知识库、笔记与智能体，支持局域网与广域网 P2P 同步。',
  },
  community: {
    title: '社区',
    addLabel: '探索社区',
    headerSegments: ['发现'],
    sidebarEmptyHint: '暂无订阅，点击上方探索',
    contentEmptyTitle: '社区',
    contentEmptyHint:
      '浏览与安装 MCP、技能、工作流与知识资源，参与社区任务、资讯与留言互动。',
  },
  projects: {
    title: '项目管理',
    addLabel: '新建项目',
    headerSegments: ['全部项目'],
    sidebarEmptyHint: '在左侧选择「成本管理」或「计划管理」查看看板',
    contentEmptyTitle: '项目管理',
    contentEmptyHint: '成本与计划 MOCK 看板已接入；其余模块与 EPC 工作流将在后续阶段启用。',
  },
}

export function getModulePageConfig(view: ModuleView, t?: TranslateFn): ModulePageConfig {
  if (t) return resolveModulePageConfig(view, t)
  return MODULE_PAGE_CONFIG[view]
}
