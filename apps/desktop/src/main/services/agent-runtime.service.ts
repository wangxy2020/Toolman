import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { BUILTIN_SKILLS } from '@toolman/shared'
import { resolveWorkingDirectory, type PermissionMode } from './permission.service'
import { getSkillContent, getSkillInfo } from './skill.service'

const SOUL_FILE = 'soul.md'

export function resolveEffectivePermissionMode(
  permissionMode: PermissionMode,
  autonomousMode: boolean,
): PermissionMode {
  if (autonomousMode) return 'auto-edit'
  return permissionMode
}

export function loadSoulMd(workingDirectory?: string): string | null {
  const base = resolveWorkingDirectory(workingDirectory)
  const soulPath = join(base, SOUL_FILE)
  if (!existsSync(soulPath)) return null
  try {
    const content = readFileSync(soulPath, 'utf8').trim()
    return content || null
  } catch {
    return null
  }
}

export function buildSkillsSystemHint(
  skillIds: string[],
  options?: { compact?: boolean },
): string | null {
  if (skillIds.length === 0) return null

  const toSummaryLines = () => {
    const lines: string[] = []
    for (const skillId of skillIds) {
      const meta = getSkillInfo(skillId)
      if (meta) {
        lines.push(`- **${meta.name}**: ${meta.description}`)
        continue
      }
      const builtin = BUILTIN_SKILLS.find((skill) => skill.id === skillId)
      if (builtin) {
        lines.push(`- **${builtin.name}**: ${builtin.description}`)
      }
    }
    return lines
  }

  if (options?.compact) {
    const lines = toSummaryLines()
    if (lines.length === 0) return null
    return ['## 已挂载技能', '可在合适场景运用以下技能（详情见设置）：', ...lines].join('\n')
  }

  const sections: string[] = []
  for (const skillId of skillIds) {
    const meta = getSkillInfo(skillId)
    const content = getSkillContent(skillId)
    if (!meta || !content) continue
    sections.push(`### 技能：${meta.name}\n\n${content}`)
  }

  if (sections.length === 0) {
    const lines = toSummaryLines()
    if (lines.length === 0) return null
    return [
      '## 已挂载技能',
      '你可以在合适场景主动运用以下技能能力：',
      ...lines,
    ].join('\n')
  }

  return [
    '## 已挂载技能',
    '请严格遵循以下技能文档中的指令与流程：',
    ...sections,
  ].join('\n\n')
}

export function buildAutonomousSystemHint(): string {
  return [
    '## 自主模式',
    '你正处于自主运行模式：可长时间推进任务，无需等待用户逐步确认。',
    '请主动使用任务管理工具记录、更新和完成子任务；优先读取工作目录中的 soul.md（若存在）作为身份与行为准则。',
    '避免提出需要用户即时交互才能继续的问题；遇到阻塞时记录任务状态并给出下一步建议。',
  ].join('\n')
}

export function buildMemorySystemHint(memories: string[]): string | null {
  if (memories.length === 0) return null
  return [
    '## 长期记忆',
    '以下是跨会话保留的上下文，请在不与当前用户消息冲突时参考：',
    ...memories.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n')
}

export function buildWebSearchSystemHint(searchResult: string, query: string): string {
  return [
    '## 网络搜索结果',
    `查询：${query}`,
    searchResult.trim(),
    '请结合以上检索信息回答用户，并注明信息可能过时。',
  ].join('\n\n')
}

export function buildKnowledgeEnabledHint(): string {
  return [
    '## 本地知识库（已开启）',
    '回答文档内容问题时：',
    '1. **优先**使用下方自动注入的「知识库检索结果」，或调用 `search_local_knowledge` 工具补充检索。',
    '2. **禁止**使用 fs_glob、fs_list、fs_read 在工作目录或「本地知识库」文件夹中查找/读取 PDF、DOCX 等原文件；磁盘上的文件是二进制或未索引副本，无法替代已嵌入的分块。',
    '3. 询问某一页时，检索 query 应包含文件名与页码，例如「The-Little-Prince.pdf 第6页」。',
  ].join('\n')
}

export function buildKnowledgeEmptySearchHint(query: string): string {
  return [
    '## 知识库检索',
    `针对「${query}」未自动检索到足够相关的内容。`,
    '请调用 `search_local_knowledge`，用文件名、页码或关键句再次检索后再回答。',
    '**禁止**使用 fs_glob / fs_read 在磁盘上查找 PDF 原文件；正文只能通过知识库分块获取。',
  ].join('\n')
}

export function buildKnowledgeUnavailableHint(options: {
  hasBoundKbIds: boolean
}): string {
  if (options.hasBoundKbIds) {
    return [
      '## 本地知识库',
      '已开启知识库检索，但智能体绑定的知识库不可用（可能已删除或不支持向量检索）。',
      '请在智能体设置 → 知识库中重新绑定，或调用 list_local_knowledges 查看可用知识库。',
    ].join('\n')
  }
  return [
    '## 本地知识库',
    '已开启知识库检索，但当前工作区没有可检索的知识库（需 local / network 类型且已完成嵌入）。',
    '请在「知识库」模块导入文档并完成索引，或在智能体设置中绑定已有知识库。',
  ].join('\n')
}

export function buildKnowledgeSystemHint(
  results: Array<{
    documentTitle: string
    kbName: string
    score: number
    text: string
    sourcePath?: string | null
  }>,
  query: string,
): string | null {
  if (results.length === 0) return null

  const body = results
    .map((item, index) => {
      const source = item.sourcePath ? `\n*来源: ${item.sourcePath}*` : ''
      return `#### ${index + 1}. ${item.documentTitle}（${item.kbName}，相关度 ${(item.score * 100).toFixed(1)}%）\n${item.text.trim()}${source}`
    })
    .join('\n\n')

  return [
    '## 知识库检索结果',
    `查询：${query}`,
    `找到 ${results.length} 条相关内容：`,
    body,
    '若用户问题指定了文件名或页码，**只使用标题/来源匹配该文件且页码一致的分块**作答，忽略其他文档的检索结果。',
    '请**直接基于以上分块内容**回答，不要调用 fs_glob / fs_read 去读取来源 PDF 原文件。',
    '若内容不足以回答，可调用 `search_local_knowledge` 补充检索，或明确说明索引中缺少该内容。',
  ].join('\n\n')
}
