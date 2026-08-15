import { getPathBasename } from '../knowledge/knowledge-path-utils'

export type AssistantLibTextbookSource = 'knowledge' | 'local'

export function formatAssistantLibSelectedFiles(paths: string[]): string {
  if (paths.length === 0) return ''
  if (paths.length === 1) return paths[0]
  return `${getPathBasename(paths[0])} 等 ${paths.length} 个文件`
}
