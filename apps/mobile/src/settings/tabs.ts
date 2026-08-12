export type SettingsTabId =
  | 'user'
  | 'agent'
  | 'knowledge'
  | 'notes'
  | 'translate'
  | 'group'
  | 'community'
  | 'classroom'
  | 'projects'
  | 'system'

export const SETTINGS_TABS: Array<{
  id: SettingsTabId
  label: string
  hint: string
}> = [
  { id: 'user', label: '用户信息', hint: '账户、同步与设备' },
  { id: 'agent', label: '智能体', hint: '模型与对话默认项' },
  { id: 'knowledge', label: '知识库', hint: '检索与桌面索引' },
  { id: 'notes', label: '笔记', hint: '同步与自动保存' },
  { id: 'translate', label: '翻译', hint: '目标语言与管线' },
  { id: 'group', label: '群组', hint: '群组消息与桥接' },
  { id: 'community', label: '社区', hint: 'Hub 与访客模式' },
  { id: 'classroom', label: '课堂', hint: '课堂智能体宿主' },
  { id: 'projects', label: '项目', hint: '项目管理宿主' },
  { id: 'system', label: '系统设置', hint: '关于、诊断与通用选项' },
]

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'user'
