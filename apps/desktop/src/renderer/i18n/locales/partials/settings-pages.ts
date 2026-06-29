import { settingsPagesModelServiceZhCN } from './settings-pages/model-service.zh-CN'
import { settingsPagesModelServiceEn } from './settings-pages/model-service.en'
import { settingsPagesDataZhCN } from './settings-pages/data.zh-CN'
import { settingsPagesDataEn } from './settings-pages/data.en'
import { settingsPagesMcpZhCN } from './settings-pages/mcp.zh-CN'
import { settingsPagesMcpEn } from './settings-pages/mcp.en'
import { settingsPagesIntegrationsZhCN } from './settings-pages/integrations.zh-CN'
import { settingsPagesIntegrationsEn } from './settings-pages/integrations.en'
import { settingsPagesDiagnosticsZhCN } from './settings-pages/diagnostics.zh-CN'
import { settingsPagesDiagnosticsEn } from './settings-pages/diagnostics.en'

export const settingsPagesZhCN = {
  ...settingsPagesModelServiceZhCN,
  ...settingsPagesDataZhCN,
  ...settingsPagesMcpZhCN,
  ...settingsPagesIntegrationsZhCN,
  ...settingsPagesDiagnosticsZhCN,
} as const

export const settingsPagesEn = {
  ...settingsPagesModelServiceEn,
  ...settingsPagesDataEn,
  ...settingsPagesMcpEn,
  ...settingsPagesIntegrationsEn,
  ...settingsPagesDiagnosticsEn,
} as const
