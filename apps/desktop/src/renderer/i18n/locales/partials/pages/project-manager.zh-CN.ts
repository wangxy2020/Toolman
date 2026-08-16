import { projectManagerNavZhCN } from './project-manager-nav.zh-CN'
import { projectManagerWorkbenchZhCN } from './project-manager-workbench.zh-CN'
import { projectManagerFilesZhCN } from './project-manager-files.zh-CN'
import { projectManagerScheduleZhCN } from './project-manager-schedule.zh-CN'
import { projectManagerInfoZhCN } from './project-manager-info.zh-CN'
import { projectManagerTablesZhCN } from './project-manager-tables.zh-CN'
import { projectManagerCostTableZhCN } from './project-manager-cost-table.zh-CN'

export const projectManagerPageZhCN = {
  ...projectManagerNavZhCN,
  ...projectManagerWorkbenchZhCN,
  ...projectManagerFilesZhCN,
  ...projectManagerScheduleZhCN,
  ...projectManagerInfoZhCN,
  ...projectManagerTablesZhCN,
  ...projectManagerCostTableZhCN,
} as const
