export type SettingsSectionId =
  | 'general'
  | 'display'
  | 'model-service'
  | 'data'
  | 'mcp'
  | 'skills'
  | 'web-search'
  | 'memory'
  | 'channels'
  | 'documents'
  | 'quick-phrases'
  | 'shortcuts'
  | 'about'

export const SETTINGS_NAV_GROUPS: { id: SettingsSectionId; label: string }[][] = [
  [
    { id: 'general', label: '一般设置' },
    { id: 'display', label: '显示' },
    { id: 'model-service', label: '模型服务' },
    { id: 'data', label: '数据设置' },
  ],
  [
    { id: 'mcp', label: 'MCP服务器' },
    { id: 'skills', label: '技能' },
    { id: 'web-search', label: '网络搜索' },
    { id: 'memory', label: '记忆' },
    { id: 'channels', label: '频道' },
    { id: 'documents', label: '文档处理' },
    { id: 'quick-phrases', label: '快捷短语' },
    { id: 'shortcuts', label: '快捷键' },
  ],
  [{ id: 'about', label: '关于我们' }],
]

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general'
