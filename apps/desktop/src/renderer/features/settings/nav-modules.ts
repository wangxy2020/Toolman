import type { ComponentType } from 'react'
import {
  IconAgent,
  IconCommunity,
  IconGroup,
  IconKnowledge,
  IconNotes,
  IconWorkflow,
} from '../../components/icons'
import {
  IconAssistantLib,
  IconCodeTools,
  IconProjects,
  IconTranslateNav,
} from '../../components/nav-module-icons'
import type { AppView } from '../../types/app-view'

export type ModuleTier = 'core' | 'extension'

export type NavModuleId =
  | 'agent'
  | 'knowledge'
  | 'notes'
  | 'workflow'
  | 'group'
  | 'community'
  | 'translate'
  | 'assistant-lib'
  | 'code-tools'
  | 'projects'

export const LOCKED_NAV_MODULE: NavModuleId = 'agent'

export interface NavModuleDef {
  id: NavModuleId
  label: string
  icon: ComponentType<{ size?: number }>
  view?: AppView
  tier: ModuleTier
  available: boolean
  closable: boolean
}

export const NAV_MODULE_DEFS: Record<NavModuleId, NavModuleDef> = {
  agent: {
    id: 'agent',
    label: '智能体',
    icon: IconAgent,
    view: 'agent',
    tier: 'core',
    available: true,
    closable: false,
  },
  knowledge: {
    id: 'knowledge',
    label: '知识库',
    icon: IconKnowledge,
    view: 'knowledge',
    tier: 'core',
    available: true,
    closable: true,
  },
  notes: {
    id: 'notes',
    label: '笔记',
    icon: IconNotes,
    view: 'notes',
    tier: 'core',
    available: true,
    closable: true,
  },
  workflow: {
    id: 'workflow',
    label: '自动化',
    icon: IconWorkflow,
    view: 'workflow',
    tier: 'extension',
    available: false,
    closable: true,
  },
  group: {
    id: 'group',
    label: '群组',
    icon: IconGroup,
    view: 'group',
    tier: 'core',
    available: true,
    closable: true,
  },
  community: {
    id: 'community',
    label: '社区',
    icon: IconCommunity,
    view: 'community',
    tier: 'core',
    available: true,
    closable: true,
  },
  translate: {
    id: 'translate',
    label: '翻译',
    icon: IconTranslateNav,
    tier: 'extension',
    available: false,
    closable: true,
  },
  'assistant-lib': {
    id: 'assistant-lib',
    label: '助手库',
    icon: IconAssistantLib,
    tier: 'extension',
    available: false,
    closable: true,
  },
  'code-tools': {
    id: 'code-tools',
    label: '代码工具',
    icon: IconCodeTools,
    tier: 'extension',
    available: false,
    closable: true,
  },
  projects: {
    id: 'projects',
    label: '项目管理',
    icon: IconProjects,
    view: 'projects',
    tier: 'extension',
    available: true,
    closable: true,
  },
}

export const MENU_VISIBLE_POOL: NavModuleId[] = [
  'agent',
  'knowledge',
  'notes',
  'group',
  'community',
]

export const MENU_HIDDEN_POOL: NavModuleId[] = [
  'workflow',
  'translate',
  'assistant-lib',
  'code-tools',
  'projects',
]

/** 菜单设置中所有可排列的模块（显示 + 隐藏） */
export const ALL_MENU_MODULES_ORDERED: NavModuleId[] = [
  ...MENU_VISIBLE_POOL,
  ...MENU_HIDDEN_POOL,
]

export const DEFAULT_VISIBLE_NAV_MODULES: NavModuleId[] = [...MENU_VISIBLE_POOL]

export const DEFAULT_HIDDEN_NAV_MODULES: NavModuleId[] = [...MENU_HIDDEN_POOL]

const LEGACY_VISIBLE_IDS = new Set(['assistant', 'files'])

export function getNavModuleDef(id: NavModuleId): NavModuleDef {
  return NAV_MODULE_DEFS[id]
}

export function normalizeNavModules(
  visible?: NavModuleId[],
  hidden?: NavModuleId[],
): { visible: NavModuleId[]; hidden: NavModuleId[] } {
  const hasLegacyVisible = visible?.some((id) => LEGACY_VISIBLE_IDS.has(id as string)) ?? false
  const visibleInput = hasLegacyVisible
    ? DEFAULT_VISIBLE_NAV_MODULES
    : (visible ?? DEFAULT_VISIBLE_NAV_MODULES).filter((id) => ALL_MENU_MODULES_ORDERED.includes(id))

  const visibleSet = new Set<NavModuleId>(visibleInput)
  visibleSet.add(LOCKED_NAV_MODULE)

  for (const id of ALL_MENU_MODULES_ORDERED) {
    if (id !== LOCKED_NAV_MODULE && !NAV_MODULE_DEFS[id].available) {
      visibleSet.delete(id)
    }
  }

  // 若显式传入 hidden，则把其中仍标记为隐藏的模块从可见列表移除
  if (hidden) {
    for (const id of hidden) {
      if (id !== LOCKED_NAV_MODULE && ALL_MENU_MODULES_ORDERED.includes(id)) {
        visibleSet.delete(id)
      }
    }
  }

  const orderedVisible = ALL_MENU_MODULES_ORDERED.filter((id) => visibleSet.has(id))
  const orderedHidden = ALL_MENU_MODULES_ORDERED.filter(
    (id) => id !== LOCKED_NAV_MODULE && !visibleSet.has(id),
  )

  return { visible: orderedVisible, hidden: orderedHidden }
}
