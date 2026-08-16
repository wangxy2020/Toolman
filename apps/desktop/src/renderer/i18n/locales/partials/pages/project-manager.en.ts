import { projectManagerNavEn } from './project-manager-nav.en'
import { projectManagerWorkbenchEn } from './project-manager-workbench.en'
import { projectManagerFilesEn } from './project-manager-files.en'
import { projectManagerScheduleEn } from './project-manager-schedule.en'
import { projectManagerInfoEn } from './project-manager-info.en'
import { projectManagerTablesEn } from './project-manager-tables.en'
import { projectManagerCostTableEn } from './project-manager-cost-table.en'

export const projectManagerPageEn = {
  ...projectManagerNavEn,
  ...projectManagerWorkbenchEn,
  ...projectManagerFilesEn,
  ...projectManagerScheduleEn,
  ...projectManagerInfoEn,
  ...projectManagerTablesEn,
  ...projectManagerCostTableEn,
} as const
