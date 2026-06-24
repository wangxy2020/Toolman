import type { CommunityResourceType } from '@toolman/shared'

export interface CommunityResourcePublishConfig {
  manifestFile: string
  packageHint: string
  packagePickerPlaceholder: string
  packageExtensions: string[]
  categoryPlaceholder: string
  tagsPlaceholder: string
  localPackSummary?: string
}

export const COMMUNITY_RESOURCE_PUBLISH_CONFIG: Record<
  CommunityResourceType,
  CommunityResourcePublishConfig
> = {
  mcp: {
    manifestFile: 'mcp.manifest.json',
    packageHint:
      '选择任意 MCP 的 .zip / .toolman-mcp 即可，系统会自动转换为 Toolman 社区包（含 mcp.manifest.json 与 SHA256SUMS）。',
    packagePickerPlaceholder: '选择 MCP 的 zip 包',
    packageExtensions: ['toolman-mcp', 'zip'],
    categoryPlaceholder: '例如：tools、filesystem',
    tagsPlaceholder: 'stdio, filesystem, tools',
    localPackSummary: '高级：从本机 MCP 配置导出（可选）',
  },
  skill: {
    manifestFile: 'skill.manifest.json',
    packageHint:
      '选择任意含 SKILL.md 的 zip / .toolman-skill 即可，系统会自动转换为 Toolman 社区包（含 skill.manifest.json 与 SHA256SUMS）。',
    packagePickerPlaceholder: '选择 Skill 的 zip 包',
    packageExtensions: ['toolman-skill', 'zip'],
    categoryPlaceholder: '例如：productivity、coding',
    tagsPlaceholder: 'agent, prompt, skill',
  },
  workflow: {
    manifestFile: 'workflow.manifest.json',
    packageHint:
      '选择任意含 workflow.json 等工作流图文件的 zip / .toolman-workflow 即可，系统会自动转换为 Toolman 社区包（含 workflow.manifest.json 与 SHA256SUMS）。',
    packagePickerPlaceholder: '选择工作流的 zip 包',
    packageExtensions: ['toolman-workflow', 'zip'],
    categoryPlaceholder: '例如：automation、langgraph',
    tagsPlaceholder: 'workflow, automation',
  },
  knowledge: {
    manifestFile: 'knowledge-bundle.manifest.json',
    packageHint:
      '可直接选择符合规范的 zip，或使用下方「从本地知识库打包」一键生成（含 knowledge-bundle.manifest.json 与 SHA256SUMS）。',
    packagePickerPlaceholder: '选择知识库 zip 包',
    packageExtensions: ['zip'],
    categoryPlaceholder: '例如：docs、guide',
    tagsPlaceholder: 'knowledge, docs',
    localPackSummary: '高级：从本地知识库打包（可选）',
  },
  task: {
    manifestFile: 'task.manifest.json',
    packageHint: '任务交付包需符合社区任务 manifest 规范。',
    packagePickerPlaceholder: '选择任务交付包',
    packageExtensions: ['zip'],
    categoryPlaceholder: '例如：development',
    tagsPlaceholder: 'task, delivery',
  },
}

export function parsePublishTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}
