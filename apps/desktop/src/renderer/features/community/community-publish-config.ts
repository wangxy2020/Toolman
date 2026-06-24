import type { CommunityResourceType } from '@toolman/shared'

export interface CommunityResourcePublishConfig {
  manifestFile: string
  packageHint: string
  packageExtensions: string[]
  categoryPlaceholder: string
  tagsPlaceholder: string
}

export const COMMUNITY_RESOURCE_PUBLISH_CONFIG: Record<
  CommunityResourceType,
  CommunityResourcePublishConfig
> = {
  mcp: {
    manifestFile: 'mcp.manifest.json',
    packageHint: '包内需包含 mcp.manifest.json、SHA256SUMS，并声明 transport、command 与 tools。',
    packageExtensions: ['toolman-mcp', 'zip'],
    categoryPlaceholder: '例如：tools、filesystem',
    tagsPlaceholder: 'stdio, filesystem, tools',
  },
  skill: {
    manifestFile: 'skill.manifest.json',
    packageHint: '包内需包含 skill.manifest.json、SKILL.md 与 SHA256SUMS。',
    packageExtensions: ['toolman-skill', 'zip'],
    categoryPlaceholder: '例如：productivity、coding',
    tagsPlaceholder: 'agent, prompt, skill',
  },
  workflow: {
    manifestFile: 'workflow.manifest.json',
    packageHint: '包内需包含 workflow.manifest.json、工作流图文件与 SHA256SUMS。',
    packageExtensions: ['toolman-workflow', 'zip'],
    categoryPlaceholder: '例如：automation、langgraph',
    tagsPlaceholder: 'workflow, automation',
  },
  knowledge: {
    manifestFile: 'knowledge-bundle.manifest.json',
    packageHint:
      'ZIP 内需包含 knowledge-bundle.manifest.json（files 列表不可为空）、文档文件与 SHA256SUMS。',
    packageExtensions: ['zip'],
    categoryPlaceholder: '例如：docs、guide',
    tagsPlaceholder: 'knowledge, docs',
  },
  task: {
    manifestFile: 'task.manifest.json',
    packageHint: '任务交付包需符合社区任务 manifest 规范。',
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
