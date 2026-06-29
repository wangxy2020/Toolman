import { shellEn } from './core/shell.en'
import { shellZhCN } from './core/shell.zh-CN'
import { settingsCoreEn } from './core/settings-core.en'
import { settingsCoreZhCN } from './core/settings-core.zh-CN'
import { searchEn } from './core/search.en'
import { searchZhCN } from './core/search.zh-CN'
import { sidebarEn } from './core/sidebar.en'
import { sidebarZhCN } from './core/sidebar.zh-CN'
import { modulesEn } from './core/modules.en'
import { modulesZhCN } from './core/modules.zh-CN'
import { communityPanelsEn } from './core/community-panels.en'
import { communityPanelsZhCN } from './core/community-panels.zh-CN'
import { modalsEn } from './core/modals.en'
import { modalsZhCN } from './core/modals.zh-CN'
import { modulesSearchEn } from './core/modules-search.en'
import { modulesSearchZhCN } from './core/modules-search.zh-CN'
import { onboardingEn } from './core/onboarding.en'
import { onboardingZhCN } from './core/onboarding.zh-CN'

export const coreZhCN = {
  ...shellZhCN,
  settings: settingsCoreZhCN,
  ...searchZhCN,
  ...sidebarZhCN,
  ...modulesZhCN,
  ...communityPanelsZhCN,
  ...modalsZhCN,
  ...modulesSearchZhCN,
  ...onboardingZhCN,
} as const

export const coreEn = {
  ...shellEn,
  settings: settingsCoreEn,
  ...searchEn,
  ...sidebarEn,
  ...modulesEn,
  ...communityPanelsEn,
  ...modalsEn,
  ...modulesSearchEn,
  ...onboardingEn,
} as const
