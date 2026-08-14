/** Mirrors desktop `projectSidebarMenuConfig` + zh labels (mobile cannot import desktop). */

export const PROJECT_SIDEBAR_MENU_KEYS = [
  'all_projects',
  'urgent_tasks',
  'operations_management',
  'contract_risk_management',
  'key_projects',
  'progress_management',
  'cost_management',
  'resource_management',
  'security_management',
  'quality_management',
  'archive_management',
] as const

export type ProjectSidebarMenuKey = (typeof PROJECT_SIDEBAR_MENU_KEYS)[number]

export type ProjectSidebarTab = ProjectSidebarMenuKey | 'customize_menu'

export const PROJECT_SIDEBAR_CUSTOM_TAB = 'customize_menu' as const

export const DEFAULT_PROJECT_SIDEBAR_TAB: ProjectSidebarTab = 'cost_management'

export type ProjectInfoRow = {
  label: string
  value: string
}

export type ProjectSidebarMenu = {
  id: ProjectSidebarMenuKey
  label: string
  title: string
  subtitle: string
  emptyHint: string
  infoRows: ProjectInfoRow[]
}

export const PROJECT_SIDEBAR_MENUS: ProjectSidebarMenu[] = [
  {
    id: 'all_projects',
    label: '工作台',
    title: '工作台',
    subtitle: '项目工作台总览与快捷入口',
    emptyHint: '暂无项目数据。完整工作台请使用桌面端。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成工作项', value: '—' },
      { label: '高优先级', value: '—' },
    ],
  },
  {
    id: 'urgent_tasks',
    label: '待办',
    title: '待办',
    subtitle: '待办任务、预警与需跟进事项',
    emptyHint: '暂无高优先级或逾期工作项。',
    infoRows: [
      { label: '未完成工作项', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞中', value: '—' },
      { label: '关联项目', value: '—' },
      { label: '进行中', value: '—' },
    ],
  },
  {
    id: 'operations_management',
    label: '运营管理',
    title: '运营管理',
    subtitle: '运营运维、SLA 与日常运营事项',
    emptyHint: '暂无未完成工作项。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞', value: '—' },
      { label: '平均进度', value: '—' },
    ],
  },
  {
    id: 'contract_risk_management',
    label: '合约风控',
    title: '合约风控',
    subtitle: '合同履约、索赔与合约风险管控',
    emptyHint: '暂无未完成工作项。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞', value: '—' },
      { label: '平均进度', value: '—' },
    ],
  },
  {
    id: 'key_projects',
    label: '综合管理',
    title: '综合管理',
    subtitle: '重点项目与综合管理视图',
    emptyHint: '暂无重点项目数据。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成工作项', value: '—' },
      { label: '高优先级', value: '—' },
    ],
  },
  {
    id: 'progress_management',
    label: '计划管理',
    title: '计划管理',
    subtitle: '多项目 EPC 进度全景 · 计划、里程碑与偏差一目了然',
    emptyHint: '暂无项目数据',
    infoRows: [
      { label: '在管项目', value: '—' },
      { label: '计划进度', value: '—' },
      { label: '实际完成', value: '—' },
      { label: '里程碑延期', value: '—' },
      { label: '进度偏差率', value: '—' },
      { label: '风险项目', value: '—' },
    ],
  },
  {
    id: 'cost_management',
    label: '成本管理',
    title: '成本管理',
    subtitle: '多项目 EPC 成本全景 · 合同、结算与支付一目了然',
    emptyHint: '暂无项目数据',
    infoRows: [
      { label: '在管项目', value: '—' },
      { label: '合同总额', value: '—' },
      { label: '已结算', value: '—' },
      { label: '待支付', value: '—' },
      { label: '成本偏差率', value: '—' },
      { label: '风险项目', value: '—' },
    ],
  },
  {
    id: 'resource_management',
    label: '资源管理',
    title: '资源管理',
    subtitle: '人力、设备与物料资源统筹',
    emptyHint: '暂无未完成工作项。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞', value: '—' },
      { label: '平均进度', value: '—' },
    ],
  },
  {
    id: 'security_management',
    label: '安全质量',
    title: '安全质量',
    subtitle: '安全质量检查与整改跟踪',
    emptyHint: '暂无未完成工作项。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '危险源', value: '—' },
      { label: '高风险', value: '—' },
      { label: '质量控制点', value: '—' },
      { label: '质量通病', value: '—' },
      { label: '本周检查项', value: '—' },
    ],
  },
  {
    id: 'quality_management',
    label: '测量试验',
    title: '测量试验',
    subtitle: '测量试验记录与质量验收',
    emptyHint: '暂无未完成工作项。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞', value: '—' },
      { label: '平均进度', value: '—' },
    ],
  },
  {
    id: 'archive_management',
    label: '档案管理',
    title: '档案管理',
    subtitle: '项目档案归档与检索',
    emptyHint: '尚未关联任何文档。',
    infoRows: [
      { label: '项目数', value: '—' },
      { label: '未完成', value: '—' },
      { label: '高优先级', value: '—' },
      { label: '阻塞', value: '—' },
      { label: '平均进度', value: '—' },
    ],
  },
]

export function getProjectMenu(id: ProjectSidebarMenuKey): ProjectSidebarMenu {
  return PROJECT_SIDEBAR_MENUS.find((item) => item.id === id) ?? PROJECT_SIDEBAR_MENUS[0]!
}

const isMenuKey = (key: string): key is ProjectSidebarMenuKey =>
  (PROJECT_SIDEBAR_MENU_KEYS as readonly string[]).includes(key)

export type ProjectSidebarPreferences = {
  order: ProjectSidebarMenuKey[]
  hidden: ProjectSidebarMenuKey[]
}

export const getDefaultProjectSidebarPreferences = (): ProjectSidebarPreferences => ({
  order: [...PROJECT_SIDEBAR_MENU_KEYS],
  hidden: [],
})

function normalizeOrder(order: unknown): ProjectSidebarMenuKey[] {
  if (!Array.isArray(order)) return [...PROJECT_SIDEBAR_MENU_KEYS]
  const seen = new Set<ProjectSidebarMenuKey>()
  const normalized: ProjectSidebarMenuKey[] = []
  for (const item of order) {
    if (typeof item === 'string' && isMenuKey(item) && !seen.has(item)) {
      seen.add(item)
      normalized.push(item)
    }
  }
  for (const key of PROJECT_SIDEBAR_MENU_KEYS) {
    if (!seen.has(key)) normalized.push(key)
  }
  return normalized
}

function normalizeHidden(
  hidden: unknown,
  order: ProjectSidebarMenuKey[],
): ProjectSidebarMenuKey[] {
  if (!Array.isArray(hidden)) return []
  const hiddenSet = new Set<ProjectSidebarMenuKey>()
  for (const item of hidden) {
    if (typeof item === 'string' && isMenuKey(item)) hiddenSet.add(item)
  }
  if (order.filter((key) => !hiddenSet.has(key)).length === 0) return []
  return [...hiddenSet]
}

export function normalizeProjectSidebarPreferences(
  raw: Partial<ProjectSidebarPreferences> | null | undefined,
): ProjectSidebarPreferences {
  const order = normalizeOrder(raw?.order)
  return { order, hidden: normalizeHidden(raw?.hidden, order) }
}

export function getVisibleProjectMenuKeys(
  preferences: ProjectSidebarPreferences,
): ProjectSidebarMenuKey[] {
  const hidden = new Set(preferences.hidden)
  return preferences.order.filter((key) => !hidden.has(key))
}
