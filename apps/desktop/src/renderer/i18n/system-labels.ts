import type { TranslateFn } from './I18nProvider'

const BUILTIN_ASSISTANT_NAMES = new Set(['通用智能体'])
const BUILTIN_NOTEBOOK_NAMES = new Set(['默认笔记本'])
const BUILTIN_GROUP_NAMES = new Set(['默认群组'])

export function translateAssistantName(name: string, t: TranslateFn): string {
  if (BUILTIN_ASSISTANT_NAMES.has(name)) return t('system.defaultAssistant')
  return name
}

export function translateNotebookName(name: string, t: TranslateFn): string {
  if (BUILTIN_NOTEBOOK_NAMES.has(name)) return t('system.defaultNotebook')
  return name
}

export function translateGroupName(name: string, t: TranslateFn): string {
  if (BUILTIN_GROUP_NAMES.has(name)) return t('system.defaultGroup')
  return name
}

export function translateKnowledgeFolderName(name: string, t: TranslateFn): string {
  const defaults = new Set(['默认文件夹', '默认网络文件夹', '默认本地文件'])
  if (defaults.has(name)) return t('sidebar.knowledge.defaultFolder')
  return name
}
