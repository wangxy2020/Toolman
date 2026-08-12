import { TOP_NAV_MODULE_IDS, type MobileModuleId } from './module-ids'

export type { MobileModuleId }

const NAV_LABELS: Record<(typeof TOP_NAV_MODULE_IDS)[number], string> = {
  agent: '智能体',
  knowledge: '知识库',
  notes: '笔记',
  group: '群组',
  community: '社区',
  classroom: '课堂',
  projects: '项目',
}

/** Top nav modules (翻译仅在设置中配置，不在顶栏展示). */
export const MOBILE_MODULES = TOP_NAV_MODULE_IDS.map((id) => ({
  id,
  label: NAV_LABELS[id],
}))
