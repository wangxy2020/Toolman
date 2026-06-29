export const DEFAULT_FOLDER_KB_NAME = '默认文件夹'

export const LEGACY_DEFAULT_FOLDER_KB_NAMES = {
  network: '默认网络文件夹',
  local_files: '默认本地文件',
} as const

export const DEFAULT_FOLDER_KB_NAMES = {
  local: DEFAULT_FOLDER_KB_NAME,
  network: DEFAULT_FOLDER_KB_NAME,
  local_files: DEFAULT_FOLDER_KB_NAME,
} as const

export const SYSTEM_KB_NAMES = new Set([
  DEFAULT_FOLDER_KB_NAME,
  ...Object.values(LEGACY_DEFAULT_FOLDER_KB_NAMES),
])

export const DEFAULT_FOLDER_KINDS = ['local', 'network', 'local_files'] as const

export function isSystemKnowledgeBase(kb: { name: string }): boolean {
  return SYSTEM_KB_NAMES.has(kb.name)
}
